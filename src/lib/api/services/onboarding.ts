import "server-only";
import { computeOnboarding, type Onboarding } from "@/lib/onboarding/steps";
import { trialStatus, type TrialStatus } from "@/lib/onboarding/trial";
import type { SubscriptionStatus } from "@/lib/guardrails/policy";
import type { ApiContext } from "../context";

/**
 * Onboarding + trial snapshot for the dashboard and the native client
 * (SPEC-SAAS §7). Derives the checklist booleans from the tenant's own data
 * through the RLS-scoped client, then runs the pure engines. Read-only.
 */

export interface OnboardingState {
  onboarding: Onboarding;
  trial: TrialStatus;
}

async function count(
  ctx: ApiContext,
  table: "invoice" | "product",
): Promise<number> {
  const { count } = await ctx.supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("business_id", ctx.businessId);
  return count ?? 0;
}

export async function getOnboardingState(
  ctx: ApiContext,
): Promise<OnboardingState> {
  const [invoiceCount, productCount, membershipCount, business] =
    await Promise.all([
      count(ctx, "invoice"),
      count(ctx, "product"),
      ctx.supabase
        .from("membership")
        .select("user_id", { count: "exact", head: true })
        .eq("business_id", ctx.businessId)
        .then(({ count }) => count ?? 0),
      ctx.supabase
        .from("business")
        .select("subscription_status, trial_ends_at")
        .eq("id", ctx.businessId)
        .maybeSingle()
        .then(({ data }) => data),
    ]);

  const onboarding = computeOnboarding({
    hasUploadedInvoice: invoiceCount > 0,
    hasCatalogProduct: productCount > 0,
    hasTeammate: membershipCount > 1,
  });

  const trial = trialStatus({
    subscriptionStatus: (business?.subscription_status ??
      "trialing") as SubscriptionStatus,
    trialEndsAt: (business?.trial_ends_at ?? new Date().toISOString()) as string,
    now: new Date().toISOString(),
  });

  return { onboarding, trial };
}
