import "server-only";
import { buildCatalogRow, type CatalogProduct, type CatalogRow } from "@/lib/catalog/row";
import {
  computeDepartmentUpdate,
  computeOverrideUpdate,
} from "@/lib/catalog/price-update";
import { attachBarcode, type BarcodeAttachResult } from "@/lib/catalog/merge";
import { createBarcodeAttachDeps } from "@/lib/catalog/merge-deps";
import { refreshMarketPriceForProduct } from "@/lib/market/refresh";
import { recordAudit } from "@/lib/audit/record";
import {
  assertWithinRateLimit,
  MARKET_REFRESH_RATE_LIMIT,
} from "@/lib/guardrails/rate-limit";
import type { ApiContext } from "../context";
import { ApiError } from "../errors";

/**
 * Catalog operations — single logic path for /api/v1 and the dashboard.
 * Explicit ctx.businessId filters at the boundary; RLS as backstop.
 */

export interface CatalogData {
  rows: CatalogRow[];
  departments: { id: string; name: string }[];
  vendors: { id: string; name: string }[];
}

interface ProductJoin {
  id: string;
  barcode: string | null;
  name: string;
  vendor_id: string | null;
  department_id: string | null;
  department_confidence: number | null;
  current_cost_cents: number | null;
  previous_cost_cents: number | null;
  market_price_cents: number | null;
  sale_price_cents: number | null;
  sale_price_override_cents: number | null;
  vendor: { name: string } | null;
  department: { name: string } | null;
}

export async function getCatalog(ctx: ApiContext): Promise<CatalogData> {
  const [{ data: products }, { data: departments }, { data: vendors }] =
    await Promise.all([
      ctx.supabase
        .from("product")
        .select(
          `id, barcode, name, vendor_id, department_id, department_confidence,
           current_cost_cents, previous_cost_cents, market_price_cents,
           sale_price_cents, sale_price_override_cents,
           vendor:vendor_id(name), department:department_id(name)`,
        )
        .eq("business_id", ctx.businessId)
        .eq("archived", false),
      ctx.supabase
        .from("department")
        .select("id, name")
        .eq("business_id", ctx.businessId)
        .order("display_order"),
      ctx.supabase
        .from("vendor")
        .select("id, name")
        .eq("business_id", ctx.businessId)
        .order("name"),
    ]);

  const rows = ((products ?? []) as unknown as ProductJoin[]).map((p) => {
    const product: CatalogProduct = {
      id: p.id,
      barcode: p.barcode,
      name: p.name,
      vendor_id: p.vendor_id,
      vendor_name: p.vendor?.name ?? null,
      department_id: p.department_id,
      department_name: p.department?.name ?? null,
      department_confidence: p.department_confidence,
      current_cost_cents: p.current_cost_cents,
      previous_cost_cents: p.previous_cost_cents,
      market_price_cents: p.market_price_cents,
      sale_price_cents: p.sale_price_cents,
      sale_price_override_cents: p.sale_price_override_cents,
    };
    return buildCatalogRow(product);
  });

  return {
    rows,
    departments: (departments ?? []) as { id: string; name: string }[],
    vendors: (vendors ?? []) as { id: string; name: string }[],
  };
}

/** Boundary check: the product must belong to the caller's tenant. */
async function requireProduct(
  ctx: ApiContext,
  productId: string,
): Promise<{
  id: string;
  current_cost_cents: number | null;
  sale_price_override_cents: number | null;
}> {
  const { data } = await ctx.supabase
    .from("product")
    .select("id, current_cost_cents, sale_price_override_cents")
    .eq("business_id", ctx.businessId)
    .eq("id", productId)
    .maybeSingle();
  if (!data) {
    throw new ApiError("not_found", "Product not found.");
  }
  return data;
}

/** Set or clear the manual sale-price override (SPEC §4). */
export async function setSalePriceOverride(
  ctx: ApiContext,
  productId: string,
  overrideCents: number | null,
): Promise<void> {
  const product = await requireProduct(ctx, productId);

  let targetMarkup: number | null = null;
  if (overrideCents == null) {
    const { data } = await ctx.supabase
      .from("product")
      .select("department:department_id(target_markup)")
      .eq("business_id", ctx.businessId)
      .eq("id", productId)
      .maybeSingle();
    const embedded = data?.department as
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
    currentCostCents: product.current_cost_cents,
    targetMarkup,
  });
  const { error } = await ctx.supabase
    .from("product")
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq("business_id", ctx.businessId)
    .eq("id", productId);
  if (error) throw error;
  await recordAudit({
    businessId: ctx.businessId,
    actorUserId: ctx.userId,
    action:
      overrideCents == null
        ? "product.price_override_cleared"
        : "product.price_override_set",
    entityType: "product",
    entityId: productId,
    metadata: { overrideCents },
  });
}

/** Manual department assignment (SPEC §5.1): clears the confidence badge. */
export async function setProductDepartment(
  ctx: ApiContext,
  productId: string,
  departmentId: string | null,
): Promise<void> {
  const product = await requireProduct(ctx, productId);

  let targetMarkup: number | null = null;
  if (departmentId) {
    const { data: department } = await ctx.supabase
      .from("department")
      .select("target_markup")
      .eq("business_id", ctx.businessId)
      .eq("id", departmentId)
      .maybeSingle();
    if (!department) {
      throw new ApiError("not_found", "Department not found.");
    }
    targetMarkup =
      department.target_markup != null ? Number(department.target_markup) : null;
  }

  const update = computeDepartmentUpdate({
    departmentId,
    currentCostCents: product.current_cost_cents,
    targetMarkup,
    hasOverride: product.sale_price_override_cents != null,
  });
  const { error } = await ctx.supabase
    .from("product")
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq("business_id", ctx.businessId)
    .eq("id", productId);
  if (error) throw error;
  await recordAudit({
    businessId: ctx.businessId,
    actorUserId: ctx.userId,
    action: "product.department_changed",
    entityType: "product",
    entityId: productId,
    metadata: { departmentId },
  });
}

/** Attach a barcode; merges into an existing barcoded twin (SPEC §7.2). */
export async function attachProductBarcode(
  ctx: ApiContext,
  productId: string,
  barcode: string,
): Promise<BarcodeAttachResult> {
  await requireProduct(ctx, productId);
  const result = await attachBarcode(createBarcodeAttachDeps(ctx.supabase), {
    productId,
    barcode,
  });
  if (result.outcome === "invalid") {
    throw new ApiError("validation_failed", result.message);
  }
  await recordAudit({
    businessId: ctx.businessId,
    actorUserId: ctx.userId,
    action: "product.barcode_attached",
    entityType: "product",
    entityId: productId,
    metadata: { barcode, outcome: result.outcome },
  });
  return result;
}

/** Manual market-price refresh — always re-estimates (SPEC §4). */
export async function refreshMarketPrice(
  ctx: ApiContext,
  productId: string,
): Promise<void> {
  await requireProduct(ctx, productId);
  // Rate limit at the boundary; the quota/kill-switch guardrail is enforced
  // inside refreshMarketPriceForProduct (the chokepoint), so no path to the
  // paid call can bypass it.
  await assertWithinRateLimit(ctx.businessId, MARKET_REFRESH_RATE_LIMIT);
  await refreshMarketPriceForProduct(ctx.supabase, productId, { manual: true });
}
