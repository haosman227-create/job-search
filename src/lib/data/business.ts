import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface BusinessContext {
  userId: string;
  businessId: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
}

/**
 * The signed-in user and their business, for server components and actions.
 * Redirects to login when unauthenticated; RLS enforces the same scoping at
 * the database, this just makes the business id available to queries.
 */
export async function requireBusinessContext(): Promise<BusinessContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: membership } = await supabase
    .from("membership")
    .select("business_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    // Signed in but never onboarded (e.g. confirmed email without metadata).
    redirect("/signup?error=" + encodeURIComponent("No workspace found for this account."));
  }

  return { userId: user.id, businessId: membership.business_id, supabase };
}
