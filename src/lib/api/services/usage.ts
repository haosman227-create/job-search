import "server-only";
import { currentPeriod } from "@/lib/guardrails/enforce";
import type { SubscriptionStatus } from "@/lib/guardrails/policy";
import type { ApiContext } from "../context";

/**
 * Tenant-facing plan + usage snapshot (SPEC-SAAS §7): what plan am I on, how
 * much of this month's quota have I used, and where does my trial stand. Reads
 * only the caller's own rows through the RLS-scoped client — the global kill
 * switch is operator-only and never exposed here.
 */

export interface PlanUsage {
  plan: { id: string; name: string };
  subscriptionStatus: SubscriptionStatus;
  trialEndsAt: string;
  period: string;
  invoices: { used: number; limit: number; remaining: number };
  marketRefreshes: { used: number; limit: number; remaining: number };
}

export async function getPlanUsage(ctx: ApiContext): Promise<PlanUsage> {
  const period = currentPeriod(new Date());

  const [{ data: biz }, { data: usage }] = await Promise.all([
    ctx.supabase
      .from("business")
      .select(
        "subscription_status, trial_ends_at, plan:plan_id(id, name, monthly_invoice_quota, market_refresh_quota)",
      )
      .eq("id", ctx.businessId)
      .maybeSingle(),
    ctx.supabase
      .from("tenant_usage_period")
      .select("invoices_processed, market_refreshes")
      .eq("business_id", ctx.businessId)
      .eq("period", period)
      .maybeSingle(),
  ]);

  const plan = (Array.isArray(biz?.plan) ? biz?.plan[0] : biz?.plan) as {
    id: string;
    name: string;
    monthly_invoice_quota: number;
    market_refresh_quota: number;
  } | null;

  const invoiceLimit = plan?.monthly_invoice_quota ?? 0;
  const marketLimit = plan?.market_refresh_quota ?? 0;
  const invoicesUsed = usage?.invoices_processed ?? 0;
  const marketUsed = usage?.market_refreshes ?? 0;

  return {
    plan: { id: plan?.id ?? "unknown", name: plan?.name ?? "Unknown" },
    subscriptionStatus: (biz?.subscription_status ?? "trialing") as SubscriptionStatus,
    trialEndsAt: (biz?.trial_ends_at ?? new Date().toISOString()) as string,
    period,
    invoices: {
      used: invoicesUsed,
      limit: invoiceLimit,
      remaining: Math.max(0, invoiceLimit - invoicesUsed),
    },
    marketRefreshes: {
      used: marketUsed,
      limit: marketLimit,
      remaining: Math.max(0, marketLimit - marketUsed),
    },
  };
}
