import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Operator audit-trail loader (SPEC-SAAS §6): given a tenant and/or time range,
 * what happened. Cross-tenant by design — reads with service-role access behind
 * the same env gate as the cost dashboard (internalMetricsEnabled).
 */

export interface AuditTrailEntry {
  id: string;
  businessId: string;
  businessName: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  createdAt: string;
}

export interface AuditTrailQuery {
  businessId?: string;
  since?: string;
  limit?: number;
}

interface RawRow {
  id: string;
  business_id: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string;
  created_at: string;
  business: { name: string } | { name: string }[] | null;
}

export async function loadAuditTrail(
  query: AuditTrailQuery = {},
): Promise<AuditTrailEntry[]> {
  const admin = createAdminClient();
  let q = admin
    .from("audit_log")
    .select(
      "id, business_id, actor_user_id, action, entity_type, entity_id, summary, created_at, business:business_id(name)",
    )
    .order("created_at", { ascending: false })
    .limit(Math.min(query.limit ?? 200, 500));

  if (query.businessId) q = q.eq("business_id", query.businessId);
  if (query.since) q = q.gte("created_at", query.since);

  const { data } = await q;
  return ((data ?? []) as RawRow[]).map((r) => {
    const biz = Array.isArray(r.business) ? r.business[0] : r.business;
    return {
      id: r.id,
      businessId: r.business_id,
      businessName: biz?.name ?? "(unknown)",
      actorUserId: r.actor_user_id,
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id,
      summary: r.summary,
      createdAt: r.created_at,
    };
  });
}
