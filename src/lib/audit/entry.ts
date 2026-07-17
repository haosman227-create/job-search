/**
 * Pure audit-entry construction (SPEC-SAAS §6, §9.6). Turns a typed action +
 * context into the append-only row shape and a human summary. No I/O — the
 * recorder writes what this builds, so the mapping from action to a readable
 * line stays testable and consistent across every call site.
 */

export type AuditAction =
  | "invoice.confirmed"
  | "product.price_override_set"
  | "product.price_override_cleared"
  | "product.department_changed"
  | "product.barcode_attached"
  | "department.created"
  | "department.updated"
  | "department.deleted"
  | "business.profile_updated"
  | "member.invited"
  | "billing.plan_changed"
  | "billing.subscription_canceled";

export interface AuditInput {
  businessId: string;
  /** Null for system/webhook actions (e.g. Stripe-driven changes). */
  actorUserId: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface AuditEntryRow {
  business_id: string;
  actor_user_id: string | null;
  action: AuditAction;
  entity_type: string;
  entity_id: string | null;
  summary: string;
  metadata: Record<string, unknown>;
}

function str(value: unknown): string | undefined {
  return value === undefined || value === null ? undefined : String(value);
}

/** A short, human-readable line for the audit trail view and data exports. */
export function describeAudit(
  action: AuditAction,
  metadata: Record<string, unknown> = {},
): string {
  const name = str(metadata.name);
  switch (action) {
    case "invoice.confirmed":
      return `Confirmed invoice${metadata.lineCount ? ` (${metadata.lineCount} lines)` : ""}`;
    case "product.price_override_set":
      return `Set a manual sale price on ${name ?? "a product"}`;
    case "product.price_override_cleared":
      return `Cleared the manual sale price on ${name ?? "a product"}`;
    case "product.department_changed":
      return `Moved ${name ?? "a product"} to a different department`;
    case "product.barcode_attached":
      return `Attached a barcode to ${name ?? "a product"}`;
    case "department.created":
      return `Created department ${name ?? ""}`.trim();
    case "department.updated":
      return `Updated department ${name ?? ""}`.trim();
    case "department.deleted":
      return `Deleted department ${name ?? ""}`.trim();
    case "business.profile_updated":
      return "Updated the business profile";
    case "member.invited":
      return `Invited ${str(metadata.email) ?? "a teammate"}`;
    case "billing.plan_changed":
      return `Plan changed to ${str(metadata.planId) ?? "a new plan"}`;
    case "billing.subscription_canceled":
      return "Subscription canceled — reverted to the free plan";
  }
}

export function buildAuditEntry(input: AuditInput): AuditEntryRow {
  const metadata = input.metadata ?? {};
  return {
    business_id: input.businessId,
    actor_user_id: input.actorUserId,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    summary: describeAudit(input.action, metadata),
    metadata,
  };
}
