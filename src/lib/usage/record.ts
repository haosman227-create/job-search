import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeCostMicroUsd, type ClaudeUsage } from "./cost";

/**
 * The write-path usage recorder (SPEC-SAAS §9.2): after every Claude call the
 * caller records exactly one usage event, atomically bumping the tenant's
 * period counters via the record_usage_event RPC. Recording is a service-role
 * operation (append-only tables are not writable by tenant clients), so it
 * always uses the admin client — usable from any call path, background or not.
 */

export interface RecordUsageInput {
  businessId: string;
  userId: string | null;
  operation: "extraction" | "market_pricing";
  usage: ClaudeUsage;
  invoiceId?: string | null;
  /** How many invoices this call produced (bumps the monthly invoice cap). */
  invoices?: number;
  lineItems?: number;
  storageBytes?: number;
}

/**
 * Roll the tenant's period counters forward AFTER an invoice has actually
 * persisted (P1 audit fix: quota is consumed on success, never for a failed
 * write — the cost event was already recorded at call time).
 */
export interface RecordProcessedInput {
  businessId: string;
  invoices: number;
  lineItems: number;
  storageBytes: number;
}

export async function recordProcessed(
  input: RecordProcessedInput,
  client: SupabaseClient = createAdminClient(),
): Promise<void> {
  const { error } = await client.rpc("record_invoice_processed", {
    p_business_id: input.businessId,
    p_invoices: input.invoices,
    p_line_items: input.lineItems,
    p_storage_bytes: input.storageBytes,
  });
  if (error) {
    throw new Error(`Failed to record processed invoice: ${error.message}`);
  }
}

export async function recordUsage(
  input: RecordUsageInput,
  client: SupabaseClient = createAdminClient(),
): Promise<void> {
  const { error } = await client.rpc("record_usage_event", {
    p_business_id: input.businessId,
    p_user_id: input.userId,
    p_operation: input.operation,
    p_model: input.usage.model,
    p_input_tokens: input.usage.inputTokens,
    p_output_tokens: input.usage.outputTokens,
    p_cost_micro_usd: computeCostMicroUsd(input.usage),
    p_invoice_id: input.invoiceId ?? null,
    p_invoices: input.invoices ?? 0,
    p_line_items: input.lineItems ?? 0,
    p_storage_bytes: input.storageBytes ?? 0,
  });
  if (error) {
    // A metering write must not be silently lost: surface it so the call path
    // (and later, alerting) knows this Claude spend went unrecorded.
    throw new Error(`Failed to record usage event: ${error.message}`);
  }
}
