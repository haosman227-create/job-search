import "server-only";
import type Stripe from "stripe";
import {
  applyBillingEvent,
  type BillingEvent,
  type BusinessBillingState,
  type StripeSubscriptionStatus,
} from "./transition";

/**
 * Webhook orchestration (SPEC-SAAS §9.5). Stripe is the source of truth; a
 * signature-verified event is deduped, normalized, resolved to a tenant, and
 * applied through the pure transition engine. Everything I/O is injected so the
 * flow is testable without Stripe or the database.
 */

export interface NormalizedEvent {
  id: string;
  type: string;
  customerId: string | null;
  /** Present on checkout.session.completed, which carries our metadata. */
  businessIdFromMetadata: string | null;
  /** Raw Stripe price id on subscription events; resolved to a plan later. */
  priceId: string | null;
  billingEvent: BillingEvent | null;
}

function firstPriceId(
  sub: Stripe.Subscription | null | undefined,
): string | null {
  return sub?.items?.data?.[0]?.price?.id ?? null;
}

function customerId(
  ref: string | { id: string } | null | undefined,
): string | null {
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id;
}

/**
 * Map a raw Stripe event to our normalized shape (null billingEvent = ignore).
 * Pure and env-free: the price id rides through unresolved, and the caller maps
 * it to a plan (that mapping reads deploy config).
 */
export function normalizeStripeEvent(event: Stripe.Event): NormalizedEvent {
  const base = { id: event.id, type: event.type };

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const cust = customerId(session.customer);
    return {
      ...base,
      customerId: cust,
      businessIdFromMetadata: session.metadata?.business_id ?? null,
      priceId: null,
      billingEvent: {
        type: "checkout_completed",
        customerId: cust ?? "",
        subscriptionId: customerId(session.subscription),
        planId: session.metadata?.plan_id ?? null,
      },
    };
  }

  if (
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const sub = event.data.object as Stripe.Subscription;
    const cust = customerId(sub.customer);
    return {
      ...base,
      customerId: cust,
      businessIdFromMetadata: null,
      priceId: firstPriceId(sub),
      billingEvent: {
        type:
          event.type === "customer.subscription.deleted"
            ? "subscription_deleted"
            : "subscription_updated",
        customerId: cust ?? "",
        subscriptionId: sub.id,
        planId: null,
        stripeStatus: sub.status as StripeSubscriptionStatus,
      },
    };
  }

  return {
    ...base,
    customerId: null,
    businessIdFromMetadata: null,
    priceId: null,
    billingEvent: null,
  };
}

export interface WebhookDeps {
  /** Records the event id; returns false if it was already processed. */
  claimEvent(id: string, type: string, businessId: string | null): Promise<boolean>;
  resolveBusinessByCustomer(customerId: string): Promise<string | null>;
  /** Maps a Stripe price id to our plan id (reads deploy config). */
  planForPriceId(priceId: string | null): string | null;
  loadBillingState(businessId: string): Promise<BusinessBillingState | null>;
  saveBillingState(businessId: string, state: BusinessBillingState): Promise<void>;
}

export type ProcessOutcome =
  | "ignored"
  | "duplicate"
  | "no_tenant"
  | "applied";

export async function processStripeEvent(
  deps: WebhookDeps,
  event: Stripe.Event,
): Promise<ProcessOutcome> {
  const normalized = normalizeStripeEvent(event);
  if (!normalized.billingEvent) {
    // Unhandled event type — still record it so redeliveries are cheap.
    await deps.claimEvent(normalized.id, normalized.type, null);
    return "ignored";
  }

  const businessId =
    normalized.businessIdFromMetadata ??
    (normalized.customerId
      ? await deps.resolveBusinessByCustomer(normalized.customerId)
      : null);

  // Claim before applying: a redelivery of an already-applied event is skipped.
  const fresh = await deps.claimEvent(normalized.id, normalized.type, businessId);
  if (!fresh) return "duplicate";

  if (!businessId) return "no_tenant";

  const current = await deps.loadBillingState(businessId);
  if (!current) return "no_tenant";

  // Resolve the plan from the subscription's price id when the event didn't
  // carry it in metadata (subscription.updated/deleted).
  const billingEvent = {
    ...normalized.billingEvent,
    planId:
      normalized.billingEvent.planId ??
      deps.planForPriceId(normalized.priceId),
  };
  const next = applyBillingEvent(current, billingEvent);
  await deps.saveBillingState(businessId, next);
  return "applied";
}
