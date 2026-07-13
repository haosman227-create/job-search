"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireBusinessContext } from "@/lib/data/business";
import { createAdminClient } from "@/lib/supabase/admin";

export type SettingsResult = { ok: true } | { ok: false; message: string };

const departmentSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1, "Name is required"),
  targetMarkup: z.number().min(0),
  displayOrder: z.number().int().min(0),
});

const newDepartmentSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  targetMarkup: z.number().min(0),
});

const idSchema = z.object({ id: z.uuid() });
const profileSchema = z.object({ name: z.string().trim().min(1, "Name is required") });
const inviteSchema = z.object({ email: z.email("Enter a valid email") });

export async function updateDepartment(input: unknown): Promise<SettingsResult> {
  const parsed = departmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { supabase } = await requireBusinessContext();
  const { id, name, targetMarkup, displayOrder } = parsed.data;
  // RLS keeps this scoped to the caller's business.
  const { error } = await supabase
    .from("department")
    .update({ name, target_markup: targetMarkup, display_order: displayOrder })
    .eq("id", id);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/settings");
  return { ok: true };
}

export async function createDepartment(input: unknown): Promise<SettingsResult> {
  const parsed = newDepartmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { supabase, businessId } = await requireBusinessContext();

  // Place new departments after the current last one.
  const { data: last } = await supabase
    .from("department")
    .select("display_order")
    .eq("business_id", businessId)
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const displayOrder = ((last?.display_order as number | undefined) ?? 0) + 1;

  const { error } = await supabase.from("department").insert({
    business_id: businessId,
    name: parsed.data.name,
    target_markup: parsed.data.targetMarkup,
    display_order: displayOrder,
  });
  if (error) {
    return {
      ok: false,
      message: error.code === "23505" ? "A department with that name already exists." : error.message,
    };
  }
  revalidatePath("/settings");
  return { ok: true };
}

export async function deleteDepartment(input: unknown): Promise<SettingsResult> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { supabase } = await requireBusinessContext();
  // Products using this department fall back to Unassigned (FK ON DELETE SET NULL).
  const { error } = await supabase.from("department").delete().eq("id", parsed.data.id);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/settings");
  revalidatePath("/");
  return { ok: true };
}

export async function updateBusinessProfile(input: unknown): Promise<SettingsResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { supabase, businessId } = await requireBusinessContext();
  const { error } = await supabase
    .from("business")
    .update({ name: parsed.data.name })
    .eq("id", businessId);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/settings");
  return { ok: true };
}

/**
 * Invite a teammate to this workspace (SPEC §5.4). Supabase creates the auth
 * user immediately (unconfirmed) and emails them; we link that user to this
 * business so they land on the shared catalog after confirming. Requires the
 * service-role client (auth admin), so it runs after the RLS context check.
 */
export async function inviteUser(input: unknown): Promise<SettingsResult> {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { businessId } = await requireBusinessContext();
  const admin = createAdminClient();

  const { data, error } = await admin.auth.admin.inviteUserByEmail(parsed.data.email);
  if (error || !data.user) {
    return { ok: false, message: error?.message ?? "Could not send the invite." };
  }

  const { error: membershipError } = await admin
    .from("membership")
    .insert({ user_id: data.user.id, business_id: businessId });
  if (membershipError && membershipError.code !== "23505") {
    return { ok: false, message: membershipError.message };
  }
  revalidatePath("/settings");
  return { ok: true };
}
