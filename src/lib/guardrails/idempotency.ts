import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { ApiError } from "@/lib/api/errors";

/**
 * Idempotency keys (SPEC-SAAS §9.3): a retried request carrying the same
 * Idempotency-Key does the paid work exactly once and replays the first
 * response. Keys are tenant-scoped on a service-role-only table.
 *
 * Audit fixes baked in:
 * - A key claimed by a request that then FAILED is released, so the same key
 *   can be retried instead of being poisoned into permanent 409s.
 * - A claim whose owner crashed before writing a response goes stale after
 *   STALE_CLAIM_SECONDS and is taken over by the next retry.
 */

export const STALE_CLAIM_SECONDS = 60;

/** The I/O the flow needs, injectable for tests. */
export interface IdempotencyOps {
  /** Try to insert the key row; "exists" on primary-key conflict. */
  claim(): Promise<"claimed" | "exists">;
  /** The existing row's stored response (null while in flight) and age. */
  loadExisting(): Promise<{ response: unknown; ageSeconds: number } | null>;
  saveResponse(response: unknown): Promise<void>;
  /** Delete the key row (failed or stale claim). Best-effort. */
  release(): Promise<void>;
}

export async function runIdempotent<T extends Record<string, unknown>>(
  ops: IdempotencyOps,
  produce: () => Promise<T>,
): Promise<{ result: T; replayed: boolean }> {
  const attempt = async (): Promise<{ result: T; replayed: boolean }> => {
    let result: T;
    try {
      result = await produce();
    } catch (error) {
      // A failed request must not poison its key — release so a retry with
      // the same key can run again.
      await ops.release().catch(() => {});
      throw error;
    }
    await ops.saveResponse(result);
    return { result, replayed: false };
  };

  if ((await ops.claim()) === "claimed") {
    return attempt();
  }

  const existing = await ops.loadExisting();
  if (existing?.response) {
    return { result: existing.response as T, replayed: true };
  }

  // In flight — or the claimant crashed. Take over stale claims; otherwise
  // tell the client to retry shortly.
  if (existing && existing.ageSeconds > STALE_CLAIM_SECONDS) {
    await ops.release();
    if ((await ops.claim()) === "claimed") {
      return attempt();
    }
  }
  throw new ApiError(
    "invalid_state",
    "A request with this Idempotency-Key is still being processed.",
  );
}

/** Binds the flow to the service-role idempotency_key table. */
export async function withIdempotency<T extends Record<string, unknown>>(
  businessId: string,
  key: string,
  operation: string,
  produce: () => Promise<T>,
  client: SupabaseClient = createAdminClient(),
): Promise<{ result: T; replayed: boolean }> {
  const ops: IdempotencyOps = {
    async claim() {
      const { error } = await client
        .from("idempotency_key")
        .insert({ business_id: businessId, key, operation });
      if (!error) return "claimed";
      if (error.code === "23505") return "exists";
      throw new ApiError("internal_error", "Could not process request.");
    },
    async loadExisting() {
      const { data } = await client
        .from("idempotency_key")
        .select("response, created_at")
        .eq("business_id", businessId)
        .eq("key", key)
        .maybeSingle();
      if (!data) return null;
      return {
        response: data.response,
        ageSeconds: (Date.now() - Date.parse(data.created_at)) / 1000,
      };
    },
    async saveResponse(response) {
      await client
        .from("idempotency_key")
        .update({ response })
        .eq("business_id", businessId)
        .eq("key", key);
    },
    async release() {
      await client
        .from("idempotency_key")
        .delete()
        .eq("business_id", businessId)
        .eq("key", key);
    },
  };
  return runIdempotent(ops, produce);
}
