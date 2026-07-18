import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { INVOICES_BUCKET } from "@/lib/invoices/upload";
import { invoicesPastRetention } from "@/lib/account/retention";
import { logger } from "@/lib/log/logger";

/**
 * Scheduled maintenance (audit P2): the jobs that make the product's promises
 * true over time. Session 7 promised deletion-after-grace and image retention;
 * Session 3 created TTL tables. Nothing ran any of it — this does. Invoked
 * daily by the platform cron via /api/cron/maintenance.
 *
 * All I/O is injected so the orchestration (ordering, what gets swept, what
 * survives) is unit-testable; createMaintenanceDeps binds to the admin client.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** How long finished bookkeeping rows are kept. */
export const IDEMPOTENCY_TTL_HOURS = 24;
export const RATE_WINDOW_TTL_HOURS = 2;
export const STRIPE_EVENT_TTL_DAYS = 30;

export interface MaintenanceDeps {
  /** Tenants whose deletion grace period has elapsed. */
  listDueForPurge(nowIso: string): Promise<string[]>;
  /** Every stored invoice file path for a tenant (source of truth: invoice rows). */
  listInvoiceFilePaths(businessId: string): Promise<string[]>;
  removeFiles(paths: string[]): Promise<void>;
  /** Cascade-deletes the tenant's rows across every table. */
  deleteBusiness(businessId: string): Promise<void>;

  /** Tenants that opted into an image-retention window. */
  listRetentionTenants(): Promise<{ businessId: string; retentionDays: number }[]>;
  listInvoicesWithFiles(
    businessId: string,
  ): Promise<{ id: string; createdAt: string; filePaths: string[] }[]>;
  /** Drop the file references; extracted data stays (SPEC-SAAS §5). */
  clearInvoiceFiles(invoiceId: string): Promise<void>;

  deleteExpiredIdempotencyKeys(beforeIso: string): Promise<void>;
  deleteExpiredRateWindows(beforeIso: string): Promise<void>;
  deleteExpiredStripeEvents(beforeIso: string): Promise<void>;
}

export interface MaintenanceSummary {
  purgedTenants: number;
  sweptInvoices: number;
}

export async function runMaintenance(
  deps: MaintenanceDeps,
  now: Date = new Date(),
): Promise<MaintenanceSummary> {
  const nowIso = now.toISOString();

  // 1. Hard-delete tenants past their grace period: files first (a cascade
  //    can't reach storage), then the business row (cascades all tables).
  let purgedTenants = 0;
  for (const businessId of await deps.listDueForPurge(nowIso)) {
    const paths = await deps.listInvoiceFilePaths(businessId);
    if (paths.length > 0) await deps.removeFiles(paths);
    await deps.deleteBusiness(businessId);
    purgedTenants += 1;
    logger.info("tenant purged after deletion grace period", { businessId });
  }

  // 2. Image-retention sweep: delete stored images past each tenant's window;
  //    the extracted cost data stays in the catalog.
  let sweptInvoices = 0;
  for (const tenant of await deps.listRetentionTenants()) {
    const invoices = await deps.listInvoicesWithFiles(tenant.businessId);
    const dueIds = new Set(
      invoicesPastRetention(invoices, tenant.retentionDays, nowIso),
    );
    for (const invoice of invoices) {
      if (!dueIds.has(invoice.id)) continue;
      if (invoice.filePaths.length > 0) await deps.removeFiles(invoice.filePaths);
      await deps.clearInvoiceFiles(invoice.id);
      sweptInvoices += 1;
    }
  }

  // 3. TTL cleanup for bookkeeping tables that otherwise grow forever.
  await deps.deleteExpiredIdempotencyKeys(
    new Date(now.getTime() - IDEMPOTENCY_TTL_HOURS * HOUR_MS).toISOString(),
  );
  await deps.deleteExpiredRateWindows(
    new Date(now.getTime() - RATE_WINDOW_TTL_HOURS * HOUR_MS).toISOString(),
  );
  await deps.deleteExpiredStripeEvents(
    new Date(now.getTime() - STRIPE_EVENT_TTL_DAYS * DAY_MS).toISOString(),
  );

  return { purgedTenants, sweptInvoices };
}

export function createMaintenanceDeps(): MaintenanceDeps {
  const admin = createAdminClient();
  return {
    async listDueForPurge(nowIso) {
      const { data } = await admin
        .from("business")
        .select("id")
        .not("purge_after", "is", null)
        .lt("purge_after", nowIso);
      return ((data ?? []) as { id: string }[]).map((r) => r.id);
    },
    async listInvoiceFilePaths(businessId) {
      const { data } = await admin
        .from("invoice")
        .select("file_paths")
        .eq("business_id", businessId);
      return ((data ?? []) as { file_paths: string[] }[]).flatMap(
        (r) => r.file_paths ?? [],
      );
    },
    async removeFiles(paths) {
      const { error } = await admin.storage.from(INVOICES_BUCKET).remove(paths);
      if (error) throw new Error(`storage remove failed: ${error.message}`);
    },
    async deleteBusiness(businessId) {
      const { error } = await admin.from("business").delete().eq("id", businessId);
      if (error) throw new Error(`business delete failed: ${error.message}`);
    },
    async listRetentionTenants() {
      const { data } = await admin
        .from("business")
        .select("id, image_retention_days")
        .not("image_retention_days", "is", null);
      return ((data ?? []) as { id: string; image_retention_days: number }[]).map(
        (r) => ({ businessId: r.id, retentionDays: r.image_retention_days }),
      );
    },
    async listInvoicesWithFiles(businessId) {
      const { data } = await admin
        .from("invoice")
        .select("id, created_at, file_paths")
        .eq("business_id", businessId)
        .neq("file_paths", "{}");
      return (
        (data ?? []) as { id: string; created_at: string; file_paths: string[] }[]
      )
        .filter((r) => (r.file_paths ?? []).length > 0)
        .map((r) => ({
          id: r.id,
          createdAt: r.created_at,
          filePaths: r.file_paths,
        }));
    },
    async clearInvoiceFiles(invoiceId) {
      const { error } = await admin
        .from("invoice")
        .update({ file_paths: [] })
        .eq("id", invoiceId);
      if (error) throw new Error(`clearing file_paths failed: ${error.message}`);
    },
    async deleteExpiredIdempotencyKeys(beforeIso) {
      await admin.from("idempotency_key").delete().lt("created_at", beforeIso);
    },
    async deleteExpiredRateWindows(beforeIso) {
      await admin.from("rate_limit_counter").delete().lt("window_start", beforeIso);
    },
    async deleteExpiredStripeEvents(beforeIso) {
      await admin
        .from("stripe_event")
        .delete()
        .eq("applied", true)
        .lt("received_at", beforeIso);
    },
  };
}
