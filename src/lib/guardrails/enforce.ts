import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { ApiError } from "@/lib/api/errors";
import type { ApiContext } from "@/lib/api/context";
import {
  evaluateGuardrail,
  type GuardrailDecision,
  type GuardrailOperation,
  type PlanLimits,
  type SubscriptionStatus,
} from "./policy";

/**
 * Server binding for the pure guardrail: loads the tenant's plan + trial state
 * and this period's usage (via the caller's RLS-scoped client) and the global
 * kill switch (service role), then throws the right API error when a Claude
 * call must not proceed. Called at the API boundary BEFORE any Claude call.
 */

export interface GuardrailDeps {
  loadTenant(businessId: string): Promise<{
    subscriptionStatus: SubscriptionStatus;
    trialEndsAt: string;
    limits: PlanLimits;
  } | null>;
  loadUsage(
    businessId: string,
    period: string,
  ): Promise<{ invoicesProcessed: number; marketRefreshes: number }>;
  claudeEnabled(): Promise<boolean>;
  now(): Date;
}

/** Current billing period key: the calendar month in UTC ('YYYY-MM'). */
export function currentPeriod(now: Date): string {
  return now.toISOString().slice(0, 7);
}

const MESSAGES: Record<string, string> = {
  service_disabled:
    "Invoice processing is temporarily paused. Please try again shortly.",
  trial_ended:
    "Your free trial has ended. Upgrade to keep processing new invoices — your catalog stays available.",
  subscription_inactive:
    "Your subscription is inactive. Update billing to resume processing invoices.",
  invoice_quota:
    "You've reached your plan's monthly invoice limit. Upgrade for a higher cap.",
  market_quota:
    "You've reached your plan's monthly market-refresh limit. Upgrade for more.",
};

function toApiError(decision: GuardrailDecision): ApiError {
  const reason = decision.reason!;
  const message = MESSAGES[reason] ?? "This action isn't available on your plan.";
  if (reason === "service_disabled") {
    return new ApiError("service_unavailable", message, { reason });
  }
  return new ApiError("quota_exceeded", message, {
    reason,
    ...(decision.limit !== undefined ? { limit: decision.limit } : {}),
    ...(decision.used !== undefined ? { used: decision.used } : {}),
  });
}

export async function assertGuardrail(
  deps: GuardrailDeps,
  businessId: string,
  operation: GuardrailOperation,
): Promise<void> {
  const now = deps.now();
  const [tenant, claudeEnabled] = await Promise.all([
    deps.loadTenant(businessId),
    deps.claudeEnabled(),
  ]);
  if (!tenant) {
    // No plan row is a misconfigured tenant — fail closed, never spend.
    throw new ApiError("service_unavailable", "Account not fully provisioned.", {
      reason: "service_disabled",
    });
  }
  const usage = await deps.loadUsage(businessId, currentPeriod(now));

  const decision = evaluateGuardrail({
    operation,
    claudeEnabled,
    subscriptionStatus: tenant.subscriptionStatus,
    trialEndsAt: tenant.trialEndsAt,
    now: now.toISOString(),
    planLimits: tenant.limits,
    usage,
  });
  if (!decision.allowed) {
    throw toApiError(decision);
  }
}

/**
 * Builds guardrail deps from any Supabase client scoped to (or trusted for)
 * the given tenant. Works with the caller's RLS client at the API boundary and
 * the admin client inside background chokepoints; the kill switch always reads
 * via service role.
 */
export function createGuardrailDeps(client: SupabaseClient): GuardrailDeps {
  return {
    async loadTenant(businessId) {
      const { data } = await client
        .from("business")
        .select(
          "subscription_status, trial_ends_at, plan:plan_id(monthly_invoice_quota, market_refresh_quota)",
        )
        .eq("id", businessId)
        .maybeSingle();
      if (!data) return null;
      const plan = (
        Array.isArray(data.plan) ? data.plan[0] : data.plan
      ) as { monthly_invoice_quota: number; market_refresh_quota: number } | null;
      if (!plan) return null;
      return {
        subscriptionStatus: data.subscription_status as SubscriptionStatus,
        trialEndsAt: data.trial_ends_at as string,
        limits: {
          monthlyInvoiceQuota: plan.monthly_invoice_quota,
          marketRefreshQuota: plan.market_refresh_quota,
        },
      };
    },
    async loadUsage(businessId, period) {
      const { data } = await client
        .from("tenant_usage_period")
        .select("invoices_processed, market_refreshes")
        .eq("business_id", businessId)
        .eq("period", period)
        .maybeSingle();
      return {
        invoicesProcessed: data?.invoices_processed ?? 0,
        marketRefreshes: data?.market_refreshes ?? 0,
      };
    },
    async claudeEnabled() {
      // The kill switch lives on a service-role-only table.
      const admin = createAdminClient();
      const { data } = await admin
        .from("platform_setting")
        .select("claude_enabled")
        .eq("id", true)
        .maybeSingle();
      // Fail closed if the flag can't be read.
      return data?.claude_enabled ?? false;
    },
    now: () => new Date(),
  };
}

/** Convenience: enforce the guardrail for a request context in one call. */
export async function assertClaudeGuardrail(
  ctx: ApiContext,
  operation: GuardrailOperation,
): Promise<void> {
  await assertGuardrail(
    createGuardrailDeps(ctx.supabase),
    ctx.businessId,
    operation,
  );
}
