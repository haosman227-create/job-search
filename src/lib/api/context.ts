import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";
import { createClient as createCookieClient } from "@/lib/supabase/server";
import { ApiError } from "./errors";

/**
 * The tenant-scoped identity every /api/v1 request runs as. Two ways in,
 * one shape out:
 *
 * - `Authorization: Bearer <supabase JWT>` — how a native client
 *   authenticates. The client is built with the caller's JWT, so RLS applies
 *   to every query it makes.
 * - Cookie session — how the web dashboard authenticates (same Supabase
 *   session, carried by cookies instead of a header).
 *
 * Tenant scoping is enforced HERE at the boundary (businessId resolved from
 * the authenticated user's membership; services filter by it explicitly).
 * RLS remains the backstop, never the only check (SPEC-SAAS §5).
 */
export interface ApiContext {
  supabase: SupabaseClient;
  userId: string;
  businessId: string;
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

/** Supabase client that acts as the JWT's user (anon key + user token; RLS on). */
function createBearerClient(token: string): SupabaseClient {
  const env = getServerEnv();
  return createSupabaseClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

export interface ContextDeps {
  createBearerClient(token: string): SupabaseClient;
  createCookieClient(): Promise<SupabaseClient>;
}

const defaultDeps: ContextDeps = {
  createBearerClient,
  createCookieClient: () => createCookieClient(),
};

export async function resolveApiContext(
  request: Request,
  deps: ContextDeps = defaultDeps,
): Promise<ApiContext> {
  const token = bearerToken(request);
  const supabase = token
    ? deps.createBearerClient(token)
    : await deps.createCookieClient();

  const {
    data: { user },
  } = token
    ? await supabase.auth.getUser(token)
    : await supabase.auth.getUser();

  if (!user) {
    throw new ApiError("unauthorized", "Sign in to use the API.");
  }

  const { data: membership } = await supabase
    .from("membership")
    .select("business_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    throw new ApiError("no_workspace", "No workspace found for this account.");
  }

  return { supabase, userId: user.id, businessId: membership.business_id };
}
