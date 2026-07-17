import "server-only";
import { getServerEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  summarizeUsage,
  type PeriodCounterRow,
  type TenantPeriodSummary,
  type UsageEventRow,
} from "./summary";

/** The internal cost dashboard is only reachable where an operator enables it. */
export function internalMetricsEnabled(): boolean {
  return getServerEnv().INTERNAL_METRICS_ENABLED === "1";
}

interface RawEvent {
  business_id: string;
  operation: "extraction" | "market_pricing";
  cost_micro_usd: number | string;
  created_at: string;
  business: { name: string } | { name: string }[] | null;
}

function businessName(row: RawEvent): string {
  const b = Array.isArray(row.business) ? row.business[0] : row.business;
  return b?.name ?? "(unknown)";
}

/**
 * Loads every tenant's usage with service-role access and reduces it to the
 * per-tenant, per-month cost lines the internal view renders. Reads all
 * businesses' data deliberately — this is the cross-tenant operator surface,
 * gated by {@link internalMetricsEnabled}.
 */
export async function loadUsageSummary(): Promise<TenantPeriodSummary[]> {
  const supabase = createAdminClient();

  const [{ data: events }, { data: periods }] = await Promise.all([
    supabase
      .from("usage_events")
      .select("business_id, operation, cost_micro_usd, created_at, business:business_id(name)")
      .order("created_at", { ascending: false }),
    supabase
      .from("tenant_usage_period")
      .select("business_id, period, invoices_processed"),
  ]);

  const eventRows: UsageEventRow[] = ((events ?? []) as RawEvent[]).map((e) => ({
    businessId: e.business_id,
    businessName: businessName(e),
    // The event's UTC month, matching the period the counters roll into.
    period: new Date(e.created_at).toISOString().slice(0, 7),
    operation: e.operation,
    costMicroUsd: Number(e.cost_micro_usd),
  }));

  const periodRows: PeriodCounterRow[] = (
    (periods ?? []) as {
      business_id: string;
      period: string;
      invoices_processed: number;
    }[]
  ).map((p) => ({
    businessId: p.business_id,
    period: p.period,
    invoicesProcessed: p.invoices_processed,
  }));

  return summarizeUsage(eventRows, periodRows);
}
