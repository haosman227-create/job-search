import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";

/**
 * Service-role client for background work (extraction jobs) that runs after
 * the user's response has been sent and outside their cookie session. It
 * bypasses RLS, so callers must always scope queries by ids they obtained
 * through an RLS-checked path.
 */
export function createAdminClient() {
  const env = getServerEnv();
  return createSupabaseClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );
}
