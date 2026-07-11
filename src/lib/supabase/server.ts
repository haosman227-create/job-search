import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getServerEnv } from "@/lib/env";

/**
 * Supabase client for server components, server actions, and route handlers.
 * Cookie writes throw in server components; middleware owns token refresh,
 * so those writes are safely ignored there.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const env = getServerEnv();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a server component; middleware refreshes sessions.
          }
        },
      },
    },
  );
}
