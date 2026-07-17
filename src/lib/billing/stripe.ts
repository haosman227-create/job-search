import "server-only";
import Stripe from "stripe";
import { getServerEnv } from "@/lib/env";
import { ApiError } from "@/lib/api/errors";

/**
 * Lazily-constructed Stripe client. Callers should gate on billingConfigured()
 * first; this throws a 503 rather than a raw error if the key is missing so a
 * misconfigured deploy fails safe.
 */
let cached: Stripe | undefined;

export function getStripe(): Stripe {
  if (cached) return cached;
  const key = getServerEnv().STRIPE_SECRET_KEY;
  if (!key) {
    throw new ApiError("service_unavailable", "Billing is not configured.");
  }
  cached = new Stripe(key);
  return cached;
}
