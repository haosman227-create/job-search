import { computeSalePrice } from "@/lib/domain";

/**
 * Barcode attach & merge (SPEC §7.2, PLAN Phase 11). A product first created
 * without a barcode (identified by vendor + name) can have a barcode attached
 * later. If a barcoded product with the same code already exists — the same
 * item created "both ways" — the two are merged into one, preserving the
 * combined cost history.
 *
 * Framework-free with injected I/O so it runs against Supabase in production
 * and raw Postgres in tests.
 */

export interface MergeLine {
  unit_cost_cents: number | null;
  invoice_date: string | null;
  created_at: string;
}

export interface CostAfterMerge {
  previous_cost_cents: number | null;
  current_cost_cents: number | null;
  sale_price_cents?: number;
}

/** Orders lines oldest → newest by invoice date, then insertion order. */
export function orderLines(lines: MergeLine[]): MergeLine[] {
  return [...lines].sort((a, b) => {
    const da = a.invoice_date ?? "";
    const db = b.invoice_date ?? "";
    if (da !== db) return da < db ? -1 : 1;
    return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
  });
}

/**
 * Current/previous cost from the combined, cost-bearing lines (newest is
 * current). Recomputes the standard sale price from the new current cost
 * unless a manual override is in force.
 */
export function planCostAfterMerge(
  lines: MergeLine[],
  targetMarkup: number | null,
  hasOverride: boolean,
): CostAfterMerge {
  const withCost = orderLines(lines).filter((l) => l.unit_cost_cents != null);
  const current = withCost.at(-1)?.unit_cost_cents ?? null;
  const previous =
    withCost.length >= 2 ? (withCost.at(-2)?.unit_cost_cents ?? null) : null;

  const result: CostAfterMerge = {
    previous_cost_cents: previous,
    current_cost_cents: current,
  };
  if (!hasOverride && targetMarkup != null && current != null) {
    result.sale_price_cents = computeSalePrice(current, targetMarkup);
  }
  return result;
}

export interface MergeProduct {
  id: string;
  business_id: string;
  barcode: string | null;
  department_id: string | null;
  sale_price_override_cents: number | null;
}

export interface BarcodeAttachDeps {
  normalizeBarcode(barcode: string): string | null;
  loadProduct(productId: string): Promise<MergeProduct | null>;
  findProductByBarcode(
    businessId: string,
    barcode: string,
  ): Promise<MergeProduct | null>;
  getDepartmentMarkup(departmentId: string): Promise<number | null>;
  listLines(productId: string): Promise<MergeLine[]>;
  setBarcode(productId: string, barcode: string): Promise<void>;
  repointLines(fromProductId: string, toProductId: string): Promise<void>;
  updateCost(productId: string, cost: CostAfterMerge): Promise<void>;
  deleteProduct(productId: string): Promise<void>;
}

export type BarcodeAttachResult =
  | { outcome: "attached"; productId: string }
  | { outcome: "merged"; survivingProductId: string; removedProductId: string }
  | { outcome: "invalid"; message: string };

export async function attachBarcode(
  deps: BarcodeAttachDeps,
  params: { productId: string; barcode: string },
): Promise<BarcodeAttachResult> {
  const barcode = deps.normalizeBarcode(params.barcode);
  if (!barcode) {
    return { outcome: "invalid", message: "Enter a valid barcode." };
  }

  const product = await deps.loadProduct(params.productId);
  if (!product) {
    return { outcome: "invalid", message: "Product not found." };
  }
  if (product.barcode != null) {
    return { outcome: "invalid", message: "This product already has a barcode." };
  }

  const existing = await deps.findProductByBarcode(product.business_id, barcode);

  // No barcoded twin: just attach the barcode to this product.
  if (!existing || existing.id === product.id) {
    await deps.setBarcode(product.id, barcode);
    return { outcome: "attached", productId: product.id };
  }

  // A barcoded twin exists — merge this product into it, preserving history.
  await deps.repointLines(product.id, existing.id);
  const mergedLines = await deps.listLines(existing.id);
  const markup = existing.department_id
    ? await deps.getDepartmentMarkup(existing.department_id)
    : null;
  await deps.updateCost(
    existing.id,
    planCostAfterMerge(
      mergedLines,
      markup,
      existing.sale_price_override_cents != null,
    ),
  );
  await deps.deleteProduct(product.id);
  return {
    outcome: "merged",
    survivingProductId: existing.id,
    removedProductId: product.id,
  };
}
