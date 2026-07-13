"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireBusinessContext } from "@/lib/data/business";
import {
  computeDepartmentUpdate,
  computeOverrideUpdate,
} from "@/lib/catalog/price-update";
import { refreshMarketPriceForProduct } from "@/lib/market/refresh";

const setOverrideSchema = z.object({
  productId: z.uuid(),
  // Integer cents, or null to clear the override.
  overrideCents: z.int().min(0).nullable(),
});

const setDepartmentSchema = z.object({
  productId: z.uuid(),
  departmentId: z.uuid().nullable(),
});

const refreshMarketSchema = z.object({ productId: z.uuid() });

export type CatalogActionResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Set or clear a product's manual sale-price override (SPEC §4). Setting it
 * marks the price as an explicit override; clearing it recomputes the price
 * from the current cost and department markup.
 */
export async function setSalePriceOverride(
  input: unknown,
): Promise<CatalogActionResult> {
  const parsed = setOverrideSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }
  const { supabase } = await requireBusinessContext();
  const { productId, overrideCents } = parsed.data;

  let targetMarkup: number | null = null;
  let currentCostCents: number | null = null;
  if (overrideCents == null) {
    const { data: product } = await supabase
      .from("product")
      .select("current_cost_cents, department:department_id(target_markup)")
      .eq("id", productId)
      .maybeSingle();
    currentCostCents = (product?.current_cost_cents as number | null) ?? null;
    // A to-one embedded select can be typed as an array; normalize to one row.
    const embedded = product?.department as
      | { target_markup: string | number }
      | { target_markup: string | number }[]
      | null
      | undefined;
    const department = Array.isArray(embedded) ? embedded[0] : embedded;
    targetMarkup =
      department?.target_markup != null ? Number(department.target_markup) : null;
  }

  const update = computeOverrideUpdate({
    overrideCents,
    currentCostCents,
    targetMarkup,
  });

  const { error } = await supabase
    .from("product")
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq("id", productId);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/");
  return { ok: true };
}

/**
 * Manually set a product's department (SPEC §5.1). A manual assignment is
 * authoritative, so its confidence is nulled — this clears the low-confidence
 * badge — and the computed sale price is refreshed for the new markup unless
 * an override is in force.
 */
export async function setProductDepartment(
  input: unknown,
): Promise<CatalogActionResult> {
  const parsed = setDepartmentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }
  const { supabase } = await requireBusinessContext();
  const { productId, departmentId } = parsed.data;

  const { data: product } = await supabase
    .from("product")
    .select("current_cost_cents, sale_price_override_cents")
    .eq("id", productId)
    .maybeSingle();
  if (!product) {
    return { ok: false, message: "Product not found" };
  }

  let targetMarkup: number | null = null;
  if (departmentId) {
    const { data: department } = await supabase
      .from("department")
      .select("target_markup")
      .eq("id", departmentId)
      .maybeSingle();
    targetMarkup =
      department?.target_markup != null ? Number(department.target_markup) : null;
  }

  const update = computeDepartmentUpdate({
    departmentId,
    currentCostCents: (product.current_cost_cents as number | null) ?? null,
    targetMarkup,
    hasOverride: product.sale_price_override_cents != null,
  });

  const { error } = await supabase
    .from("product")
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq("id", productId);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/");
  return { ok: true };
}

/**
 * Manually refresh a product's AI market-price estimate (SPEC §4). A manual
 * request always re-estimates, regardless of the cost-change policy.
 */
export async function refreshMarketPrice(
  input: unknown,
): Promise<CatalogActionResult> {
  const parsed = refreshMarketSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }
  const { supabase } = await requireBusinessContext();
  await refreshMarketPriceForProduct(supabase, parsed.data.productId, {
    manual: true,
  });
  revalidatePath("/");
  return { ok: true };
}
