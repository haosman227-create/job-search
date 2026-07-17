/**
 * Pure spend-guardrail decision (SPEC-SAAS §4, §9.3). Given a tenant's plan
 * limits, trial state, the global kill switch, and this period's usage, decide
 * whether one more Claude call of a given kind is allowed — BEFORE the call is
 * made. No I/O: the server binding loads the inputs and maps the decision to an
 * API error. Counters are plain integers; there is no money arithmetic here.
 */

export type GuardrailOperation = "extraction" | "market_pricing";

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled";

export type GuardrailReason =
  | "service_disabled"
  | "trial_ended"
  | "subscription_inactive"
  | "invoice_quota"
  | "market_quota";

export interface PlanLimits {
  monthlyInvoiceQuota: number;
  marketRefreshQuota: number;
}

export interface GuardrailInput {
  operation: GuardrailOperation;
  /** Global kill switch — false halts every tenant's spend. */
  claudeEnabled: boolean;
  subscriptionStatus: SubscriptionStatus;
  /** ISO timestamps; the trial gate compares them directly. */
  trialEndsAt: string;
  now: string;
  planLimits: PlanLimits;
  usage: { invoicesProcessed: number; marketRefreshes: number };
}

export interface GuardrailDecision {
  allowed: boolean;
  reason?: GuardrailReason;
  /** For a quota denial: the cap and how much is already used this period. */
  limit?: number;
  used?: number;
}

const ALLOW: GuardrailDecision = { allowed: true };

export function evaluateGuardrail(input: GuardrailInput): GuardrailDecision {
  // 1. Operator kill switch wins over everything.
  if (!input.claudeEnabled) {
    return { allowed: false, reason: "service_disabled" };
  }

  // 2. Subscription / trial state. An active plan skips these gates.
  if (input.subscriptionStatus === "canceled" || input.subscriptionStatus === "past_due") {
    return { allowed: false, reason: "subscription_inactive" };
  }
  if (
    input.subscriptionStatus === "trialing" &&
    Date.parse(input.now) >= Date.parse(input.trialEndsAt)
  ) {
    // Graceful read-only: extractions stop, catalog stays viewable.
    return { allowed: false, reason: "trial_ended" };
  }

  // 3. Per-plan monthly cap for this operation.
  if (input.operation === "extraction") {
    const used = input.usage.invoicesProcessed;
    const limit = input.planLimits.monthlyInvoiceQuota;
    if (used >= limit) {
      return { allowed: false, reason: "invoice_quota", limit, used };
    }
  } else {
    const used = input.usage.marketRefreshes;
    const limit = input.planLimits.marketRefreshQuota;
    if (used >= limit) {
      return { allowed: false, reason: "market_quota", limit, used };
    }
  }

  return ALLOW;
}
