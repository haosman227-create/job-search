import "server-only";
import { getServerEnv } from "@/lib/env";

/**
 * Plan <-> Stripe Price mapping and configuration checks (SPEC-SAAS §9.5).
 * Price ids are deploy-env config, never committed. Only the paid tiers map to
 * a Stripe price; 'trial' is free and has none.
 */

export type PaidPlanId = "starter" | "growth" | "pro";

export function priceIdForPlan(planId: PaidPlanId): string | undefined {
  const env = getServerEnv();
  switch (planId) {
    case "starter":
      return env.STRIPE_PRICE_STARTER;
    case "growth":
      return env.STRIPE_PRICE_GROWTH;
    case "pro":
      return env.STRIPE_PRICE_PRO;
  }
}

/** Reverse map: which plan a webhook's Stripe price id belongs to. */
export function planForPriceId(priceId: string | null | undefined): string | null {
  if (!priceId) return null;
  const env = getServerEnv();
  if (priceId === env.STRIPE_PRICE_STARTER) return "starter";
  if (priceId === env.STRIPE_PRICE_GROWTH) return "growth";
  if (priceId === env.STRIPE_PRICE_PRO) return "pro";
  return null;
}

/** Billing is usable only when the secret, webhook secret, and prices are set. */
export function billingConfigured(): boolean {
  const env = getServerEnv();
  return Boolean(
    env.STRIPE_SECRET_KEY &&
      env.STRIPE_WEBHOOK_SECRET &&
      env.STRIPE_PRICE_STARTER &&
      env.STRIPE_PRICE_GROWTH &&
      env.STRIPE_PRICE_PRO,
  );
}

/** Absolute base URL for Checkout redirects, from config or the request. */
export function appBaseUrl(request: Request): string {
  const configured = getServerEnv().NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  return new URL(request.url).origin;
}
