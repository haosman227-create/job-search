"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const credentialsSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const signupSchema = credentialsSchema.extend({
  businessName: z.string().trim().min(1, "Business name is required"),
});

function backWithError(path: "/login" | "/signup", message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

export async function login(formData: FormData): Promise<void> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    backWithError("/login", parsed.error.issues[0].message);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    backWithError("/login", "Invalid email or password");
  }
  redirect("/");
}

export async function signup(formData: FormData): Promise<void> {
  const parsed = signupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    businessName: formData.get("businessName"),
  });
  if (!parsed.success) {
    backWithError("/signup", parsed.error.issues[0].message);
  }

  const supabase = await createClient();
  // business_name in the metadata drives the on_auth_user_created trigger,
  // which creates the business + membership in the same transaction.
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { business_name: parsed.data.businessName } },
  });
  if (error) {
    backWithError("/signup", error.message);
  }
  if (!data.session) {
    // Email confirmation is enabled on the project: no session until verified.
    redirect("/login?notice=" + encodeURIComponent("Check your email to confirm your account, then sign in."));
  }
  redirect("/");
}

export async function signout(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
