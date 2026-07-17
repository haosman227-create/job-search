import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/log/logger";
import { buildAuditEntry, type AuditInput } from "./entry";

/**
 * Write-path audit recorder (SPEC-SAAS §9.6). The audit_log is append-only and
 * service-role-only, so this always uses the admin client. Recording is
 * best-effort: a mutation should not fail because its audit write did, but a
 * dropped entry is surfaced as a structured error log so it's never silent.
 */
export async function recordAudit(
  input: AuditInput,
  client?: SupabaseClient,
): Promise<void> {
  try {
    // Resolve the admin client inside the try so a config failure is caught and
    // logged, never bubbling up to fail the caller's mutation.
    const c = client ?? createAdminClient();
    const { error } = await c.from("audit_log").insert(buildAuditEntry(input));
    if (error) {
      logger.error("audit write failed", {
        action: input.action,
        businessId: input.businessId,
        entityId: input.entityId ?? null,
        error: error.message,
      });
    }
  } catch (error) {
    logger.error("audit write threw", {
      action: input.action,
      businessId: input.businessId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
