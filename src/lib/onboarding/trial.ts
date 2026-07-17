/**
 * Pure trial / subscription status for the dashboard banner (SPEC-SAAS §4, §7).
 * Turns a tenant's raw subscription state into what the UI shows: how many days
 * of trial remain and whether to nudge an upgrade. No I/O — the page loads the
 * fields and passes them in. Billing (Session 5) owns the state transitions;
 * this only describes them.
 */

import type { SubscriptionStatus } from "@/lib/guardrails/policy";

export type TrialState =
  | "active"
  | "trialing"
  | "trial_ending_soon"
  | "trial_ended"
  | "inactive";

export interface TrialStatus {
  state: TrialState;
  /** Whole days until the trial ends; null when not on a trial. */
  daysRemaining: number | null;
  headline: string;
  detail: string;
  /** Whether to surface the upgrade call-to-action. */
  showUpgrade: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Start nudging when the trial has this many days (or fewer) left. */
export const TRIAL_ENDING_SOON_DAYS = 3;

export interface TrialInput {
  subscriptionStatus: SubscriptionStatus;
  trialEndsAt: string;
  now: string;
}

export function trialStatus(input: TrialInput): TrialStatus {
  if (input.subscriptionStatus === "active") {
    return {
      state: "active",
      daysRemaining: null,
      headline: "You're on a paid plan.",
      detail: "Thanks for subscribing.",
      showUpgrade: false,
    };
  }

  if (
    input.subscriptionStatus === "past_due" ||
    input.subscriptionStatus === "canceled"
  ) {
    return {
      state: "inactive",
      daysRemaining: null,
      headline: "Your subscription is inactive.",
      detail:
        "Your catalog is still here. Update billing to start processing invoices again.",
      showUpgrade: true,
    };
  }

  // Trialing: measure whole days remaining, rounding up so a partial day still
  // counts as a day of access.
  const remainingMs = Date.parse(input.trialEndsAt) - Date.parse(input.now);
  const daysRemaining = Math.max(0, Math.ceil(remainingMs / DAY_MS));

  if (remainingMs <= 0) {
    return {
      state: "trial_ended",
      daysRemaining: 0,
      headline: "Your free trial has ended.",
      detail:
        "Your catalog stays available. Upgrade to process new invoices again.",
      showUpgrade: true,
    };
  }

  const dayLabel = daysRemaining === 1 ? "1 day" : `${daysRemaining} days`;
  if (daysRemaining <= TRIAL_ENDING_SOON_DAYS) {
    return {
      state: "trial_ending_soon",
      daysRemaining,
      headline: `${dayLabel} left in your free trial.`,
      detail: "Upgrade now to keep processing invoices without interruption.",
      showUpgrade: true,
    };
  }

  return {
    state: "trialing",
    daysRemaining,
    headline: `${dayLabel} left in your free trial.`,
    detail: "Upload invoices and build your catalog — no card required.",
    showUpgrade: false,
  };
}
