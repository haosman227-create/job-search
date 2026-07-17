/**
 * Pure billing state machine (SPEC-SAAS §4, §9.5): given the tenant's current
 * billing state and a normalized Stripe event, compute the new plan +
 * subscription status. No Stripe SDK, no I/O — the webhook route normalizes the
 * raw event, calls this, and writes the result. That keeps every money-state
 * transition unit-testable and the same whether it came from Checkout, the
 * Portal, or a dunning update.
 */

import type { SubscriptionStatus } from "@/lib/guardrails/policy";

export type BillingEventType =
  | "checkout_completed"
  | "subscription_updated"
  | "subscription_deleted";

/** Stripe subscription.status values we act on. */
export type StripeSubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "unpaid"
  | "canceled"
  | "incomplete"
  | "incomplete_expired";

export interface BillingEvent {
  type: BillingEventType;
  customerId: string;
  subscriptionId: string | null;
  /** Plan resolved from the subscription's Stripe price id, when known. */
  planId: string | null;
  /** Stripe's own status, present on subscription_updated. */
  stripeStatus?: StripeSubscriptionStatus;
}

export interface BusinessBillingState {
  planId: string;
  subscriptionStatus: SubscriptionStatus;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}

/** The free fallback a tenant lands on once a paid subscription ends. */
export const DEFAULT_PLAN_ID = "trial";

/** Map Stripe's subscription status onto our coarser billing states. */
export function mapStripeStatus(
  status: StripeSubscriptionStatus,
): SubscriptionStatus {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
    case "incomplete":
      // Access continues but billing needs attention (dunning).
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
  }
}

export function applyBillingEvent(
  current: BusinessBillingState,
  event: BillingEvent,
): BusinessBillingState {
  switch (event.type) {
    case "checkout_completed":
      // First successful payment: the tenant is now on their chosen plan.
      return {
        planId: event.planId ?? current.planId,
        subscriptionStatus: "active",
        stripeCustomerId: event.customerId,
        stripeSubscriptionId: event.subscriptionId ?? current.stripeSubscriptionId,
      };

    case "subscription_updated": {
      const status = event.stripeStatus
        ? mapStripeStatus(event.stripeStatus)
        : current.subscriptionStatus;
      // A plan change (up/downgrade) is reflected only while the sub is live;
      // a canceled update falls back to the free plan's limits.
      const planId =
        status === "canceled"
          ? DEFAULT_PLAN_ID
          : (event.planId ?? current.planId);
      return {
        planId,
        subscriptionStatus: status,
        stripeCustomerId: event.customerId ?? current.stripeCustomerId,
        stripeSubscriptionId:
          event.subscriptionId ?? current.stripeSubscriptionId,
      };
    }

    case "subscription_deleted":
      // Graceful degradation: catalog stays (read-only via the guardrail),
      // limits revert to the free plan, and we forget the dead subscription.
      return {
        planId: DEFAULT_PLAN_ID,
        subscriptionStatus: "canceled",
        stripeCustomerId: current.stripeCustomerId,
        stripeSubscriptionId: null,
      };
  }
}
