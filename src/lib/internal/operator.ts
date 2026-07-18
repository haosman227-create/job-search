import "server-only";
import { getServerEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Operator gate for the /internal/* views (SPEC-SAAS §6). The env flag alone is
 * not enough: on a shared deployment every signed-in *customer* passes the auth
 * redirect, and these views are cross-tenant. Access therefore requires BOTH
 * the flag and the signed-in user's email being on the operator allowlist.
 */

/** Pure: parse the comma-separated OPERATOR_EMAILS env into a clean list. */
export function parseOperatorEmails(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
}

/** Pure: allowlist membership; an empty allowlist admits no one (fail closed). */
export function isOperator(
  email: string | null | undefined,
  allowlist: string[],
): boolean {
  if (!email) return false;
  return allowlist.includes(email.trim().toLowerCase());
}

/** True when this request may see cross-tenant internal views. */
export async function isOperatorRequest(): Promise<boolean> {
  const env = getServerEnv();
  if (env.INTERNAL_METRICS_ENABLED !== "1") return false;
  const allowlist = parseOperatorEmails(env.OPERATOR_EMAILS);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return isOperator(user?.email, allowlist);
}
