import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAudit } from "@/lib/audit/record";
import type { ApiContext } from "../context";
import { ApiError } from "../errors";

/**
 * Settings operations (SPEC §5.4) — single logic path for /api/v1 and the
 * dashboard. Explicit ctx.businessId filters at the boundary; RLS backstop.
 */

export interface DepartmentSummary {
  id: string;
  name: string;
  targetMarkup: number;
  displayOrder: number;
}

export async function listDepartments(
  ctx: ApiContext,
): Promise<DepartmentSummary[]> {
  const { data } = await ctx.supabase
    .from("department")
    .select("id, name, target_markup, display_order")
    .eq("business_id", ctx.businessId)
    .order("display_order");
  return ((data ?? []) as {
    id: string;
    name: string;
    target_markup: string | number;
    display_order: number;
  }[]).map((d) => ({
    id: d.id,
    name: d.name,
    targetMarkup: Number(d.target_markup),
    displayOrder: d.display_order,
  }));
}

export async function createDepartment(
  ctx: ApiContext,
  input: { name: string; targetMarkup: number },
): Promise<{ id: string }> {
  const { data: last } = await ctx.supabase
    .from("department")
    .select("display_order")
    .eq("business_id", ctx.businessId)
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const displayOrder = ((last?.display_order as number | undefined) ?? 0) + 1;

  const { data, error } = await ctx.supabase
    .from("department")
    .insert({
      business_id: ctx.businessId,
      name: input.name,
      target_markup: input.targetMarkup,
      display_order: displayOrder,
    })
    .select("id")
    .single();
  if (error) {
    throw new ApiError(
      "validation_failed",
      error.code === "23505"
        ? "A department with that name already exists."
        : error.message,
    );
  }
  await recordAudit({
    businessId: ctx.businessId,
    actorUserId: ctx.userId,
    action: "department.created",
    entityType: "department",
    entityId: data.id,
    metadata: { name: input.name },
  });
  return data;
}

export async function updateDepartment(
  ctx: ApiContext,
  departmentId: string,
  input: { name: string; targetMarkup: number; displayOrder: number },
): Promise<void> {
  const { data, error } = await ctx.supabase
    .from("department")
    .update({
      name: input.name,
      target_markup: input.targetMarkup,
      display_order: input.displayOrder,
    })
    .eq("business_id", ctx.businessId)
    .eq("id", departmentId)
    .select("id");
  if (error) throw new ApiError("validation_failed", error.message);
  if (!data || data.length === 0) {
    throw new ApiError("not_found", "Department not found.");
  }
  await recordAudit({
    businessId: ctx.businessId,
    actorUserId: ctx.userId,
    action: "department.updated",
    entityType: "department",
    entityId: departmentId,
    metadata: { name: input.name },
  });
}

export async function deleteDepartment(
  ctx: ApiContext,
  departmentId: string,
): Promise<void> {
  const { data, error } = await ctx.supabase
    .from("department")
    .delete()
    .eq("business_id", ctx.businessId)
    .eq("id", departmentId)
    .select("id");
  if (error) throw new ApiError("validation_failed", error.message);
  if (!data || data.length === 0) {
    throw new ApiError("not_found", "Department not found.");
  }
  await recordAudit({
    businessId: ctx.businessId,
    actorUserId: ctx.userId,
    action: "department.deleted",
    entityType: "department",
    entityId: departmentId,
  });
}

export async function getBusinessProfile(
  ctx: ApiContext,
): Promise<{ id: string; name: string }> {
  const { data } = await ctx.supabase
    .from("business")
    .select("id, name")
    .eq("id", ctx.businessId)
    .maybeSingle();
  if (!data) {
    throw new ApiError("not_found", "Workspace not found.");
  }
  return data;
}

export async function updateBusinessProfile(
  ctx: ApiContext,
  input: { name: string },
): Promise<void> {
  const { error } = await ctx.supabase
    .from("business")
    .update({ name: input.name })
    .eq("id", ctx.businessId);
  if (error) throw new ApiError("validation_failed", error.message);
  await recordAudit({
    businessId: ctx.businessId,
    actorUserId: ctx.userId,
    action: "business.profile_updated",
    entityType: "business",
    entityId: ctx.businessId,
    metadata: { name: input.name },
  });
}

/**
 * Email invite (SPEC §5.4): creates the auth user and links their membership
 * to the caller's tenant. Uses the service-role client for auth admin — only
 * after the caller's own tenant context has been resolved.
 */
export async function inviteUser(
  ctx: ApiContext,
  email: string,
): Promise<void> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email);
  if (error || !data.user) {
    throw new ApiError(
      "validation_failed",
      error?.message ?? "Could not send the invite.",
    );
  }
  const { error: membershipError } = await admin
    .from("membership")
    .insert({ user_id: data.user.id, business_id: ctx.businessId });
  if (membershipError) {
    if (membershipError.code !== "23505") {
      throw new ApiError("internal_error", membershipError.message);
    }
    // user_id is the membership PK (one workspace per user in v1). A conflict
    // is fine if they're already in THIS workspace — but membership in another
    // workspace used to be silently swallowed as "success" while the person
    // was never actually added. Surface it instead.
    const { data: existing } = await admin
      .from("membership")
      .select("business_id")
      .eq("user_id", data.user.id)
      .maybeSingle();
    if (existing && existing.business_id !== ctx.businessId) {
      throw new ApiError(
        "invalid_state",
        "That person already belongs to another workspace and can't be invited (one workspace per account in v1).",
      );
    }
  }
  await recordAudit(
    {
      businessId: ctx.businessId,
      actorUserId: ctx.userId,
      action: "member.invited",
      entityType: "membership",
      entityId: data.user.id,
      metadata: { email },
    },
    admin,
  );
}
