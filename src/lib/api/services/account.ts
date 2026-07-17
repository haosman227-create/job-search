import "server-only";
import { recordAudit } from "@/lib/audit/record";
import {
  deletionStatus,
  purgeAfterFrom,
  type DeletionStatus,
} from "@/lib/account/deletion";
import type { ApiContext } from "../context";
import { ApiError } from "../errors";

/**
 * Tenant data-rights operations (SPEC-SAAS §5, §7): export everything, request
 * or cancel account deletion (grace period before purge), and control invoice-
 * image retention. All reads/writes go through the RLS-scoped client, so a
 * tenant can only ever touch its own data.
 */

export interface DataExport {
  exportedAt: string;
  schemaVersion: 1;
  business: Record<string, unknown> | null;
  departments: unknown[];
  vendors: unknown[];
  products: unknown[];
  invoices: unknown[];
  invoiceLines: unknown[];
  auditLog: unknown[];
}

/** Assemble the full, downloadable data bundle for the caller's tenant. */
export async function buildDataExport(ctx: ApiContext): Promise<DataExport> {
  const biz = ctx.businessId;
  const table = (name: string) =>
    ctx.supabase.from(name).select("*").eq("business_id", biz);

  const [business, departments, vendors, products, invoices, invoiceLines, auditLog] =
    await Promise.all([
      ctx.supabase.from("business").select("*").eq("id", biz).maybeSingle(),
      table("department"),
      table("vendor"),
      table("product"),
      table("invoice"),
      table("invoice_line"),
      table("audit_log"),
    ]);

  await recordAudit({
    businessId: biz,
    actorUserId: ctx.userId,
    action: "account.exported",
    entityType: "business",
    entityId: biz,
  });

  return {
    exportedAt: new Date().toISOString(),
    schemaVersion: 1,
    business: business.data ?? null,
    departments: departments.data ?? [],
    vendors: vendors.data ?? [],
    products: products.data ?? [],
    invoices: invoices.data ?? [],
    invoiceLines: invoiceLines.data ?? [],
    auditLog: auditLog.data ?? [],
  };
}

export interface DataRights {
  deletion: DeletionStatus;
  imageRetentionDays: number | null;
}

async function loadBusinessRights(ctx: ApiContext): Promise<{
  deletion_requested_at: string | null;
  purge_after: string | null;
  image_retention_days: number | null;
}> {
  const { data } = await ctx.supabase
    .from("business")
    .select("deletion_requested_at, purge_after, image_retention_days")
    .eq("id", ctx.businessId)
    .maybeSingle();
  if (!data) throw new ApiError("not_found", "Workspace not found.");
  return data;
}

export async function getDataRights(ctx: ApiContext): Promise<DataRights> {
  const row = await loadBusinessRights(ctx);
  return {
    deletion: deletionStatus({
      deletionRequestedAt: row.deletion_requested_at,
      purgeAfter: row.purge_after,
      now: new Date().toISOString(),
    }),
    imageRetentionDays: row.image_retention_days,
  };
}

export async function requestAccountDeletion(
  ctx: ApiContext,
): Promise<DeletionStatus> {
  const now = new Date();
  const { error } = await ctx.supabase
    .from("business")
    .update({
      deletion_requested_at: now.toISOString(),
      purge_after: purgeAfterFrom(now),
    })
    .eq("id", ctx.businessId);
  if (error) throw new ApiError("internal_error", error.message);

  await recordAudit({
    businessId: ctx.businessId,
    actorUserId: ctx.userId,
    action: "account.deletion_requested",
    entityType: "business",
    entityId: ctx.businessId,
  });
  return (await getDataRights(ctx)).deletion;
}

export async function cancelAccountDeletion(ctx: ApiContext): Promise<void> {
  const { error } = await ctx.supabase
    .from("business")
    .update({ deletion_requested_at: null, purge_after: null })
    .eq("id", ctx.businessId);
  if (error) throw new ApiError("internal_error", error.message);

  await recordAudit({
    businessId: ctx.businessId,
    actorUserId: ctx.userId,
    action: "account.deletion_canceled",
    entityType: "business",
    entityId: ctx.businessId,
  });
}

export async function updateImageRetention(
  ctx: ApiContext,
  retentionDays: number | null,
): Promise<void> {
  const { error } = await ctx.supabase
    .from("business")
    .update({ image_retention_days: retentionDays })
    .eq("id", ctx.businessId);
  if (error) throw new ApiError("validation_failed", error.message);

  await recordAudit({
    businessId: ctx.businessId,
    actorUserId: ctx.userId,
    action: "account.retention_changed",
    entityType: "business",
    entityId: ctx.businessId,
    metadata: { retentionDays },
  });
}
