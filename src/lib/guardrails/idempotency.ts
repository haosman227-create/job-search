import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { ApiError } from "@/lib/api/errors";

/**
 * Idempotency keys (SPEC-SAAS §9.3): a retried request carrying the same
 * Idempotency-Key does the paid work exactly once and replays the first
 * response. Keys are tenant-scoped and stored on a service-role-only table, so
 * this always uses the admin client.
 *
 * Flow: try to claim the key. If we claimed it, run the work and persist the
 * response. If it already existed, replay the stored response — or, if a
 * concurrent first attempt hasn't finished writing one yet, reject so the
 * client retries rather than racing.
 */
export async function withIdempotency<T extends Record<string, unknown>>(
  businessId: string,
  key: string,
  operation: string,
  produce: () => Promise<T>,
  client: SupabaseClient = createAdminClient(),
): Promise<{ result: T; replayed: boolean }> {
  const { data: claimed, error: claimError } = await client
    .from("idempotency_key")
    .insert({ business_id: businessId, key, operation })
    .select("key")
    .maybeSingle();

  if (claimError && claimError.code !== "23505") {
    // A real failure (not a duplicate-key conflict) — surface it.
    throw new ApiError("internal_error", "Could not process request.");
  }

  if (claimed) {
    const result = await produce();
    await client
      .from("idempotency_key")
      .update({ response: result })
      .eq("business_id", businessId)
      .eq("key", key);
    return { result, replayed: false };
  }

  // Key already exists: replay the stored response if the first attempt finished.
  const { data: existing } = await client
    .from("idempotency_key")
    .select("response")
    .eq("business_id", businessId)
    .eq("key", key)
    .maybeSingle();

  if (existing?.response) {
    return { result: existing.response as T, replayed: true };
  }
  throw new ApiError(
    "invalid_state",
    "A request with this Idempotency-Key is still being processed.",
  );
}
