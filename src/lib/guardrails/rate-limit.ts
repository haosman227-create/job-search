import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { ApiError } from "@/lib/api/errors";

/**
 * Per-tenant fixed-window rate limiting for the Claude-calling endpoints
 * (SPEC-SAAS §9.3): a runaway client can't burn a month's quota in a minute.
 * Backed by an atomic SECURITY DEFINER counter on a service-role-only table.
 */

export interface RateLimit {
  bucket: string;
  limit: number;
  windowSeconds: number;
}

/** Uploads: bound the accept rate well under any plan's monthly cap. */
export const UPLOAD_RATE_LIMIT: RateLimit = {
  bucket: "invoice_upload",
  limit: 20,
  windowSeconds: 60,
};

/** Manual market refreshes: cheaper, but still bounded per minute. */
export const MARKET_REFRESH_RATE_LIMIT: RateLimit = {
  bucket: "market_refresh",
  limit: 30,
  windowSeconds: 60,
};

export async function assertWithinRateLimit(
  businessId: string,
  rule: RateLimit,
  client: SupabaseClient = createAdminClient(),
): Promise<void> {
  const { data, error } = await client.rpc("bump_rate_limit", {
    p_business_id: businessId,
    p_bucket: rule.bucket,
    p_window_seconds: rule.windowSeconds,
  });
  if (error) {
    // Fail closed: if we can't account for the request, don't let it spend.
    throw new ApiError("service_unavailable", "Rate limiter unavailable.");
  }
  if (typeof data === "number" && data > rule.limit) {
    throw new ApiError(
      "rate_limited",
      "Too many requests. Please slow down and try again in a moment.",
      { retryAfterSeconds: rule.windowSeconds },
    );
  }
}
