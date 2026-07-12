import {
  costIncreased,
  effectiveSalePrice,
  margin,
  marketComparison,
} from "@/lib/domain";
import { isLowConfidence } from "./confidence";

/** Raw product joined with its vendor/department names, as loaded for the catalog. */
export interface CatalogProduct {
  id: string;
  barcode: string | null;
  name: string;
  vendor_id: string | null;
  vendor_name: string | null;
  department_id: string | null;
  department_name: string | null;
  department_confidence: number | null;
  current_cost_cents: number | null;
  previous_cost_cents: number | null;
  market_price_cents: number | null;
  sale_price_cents: number | null;
  sale_price_override_cents: number | null;
}

/** Everything the catalog table renders for one product (SPEC §5.1). */
export interface CatalogRow {
  id: string;
  barcode: string | null;
  name: string;
  vendorId: string | null;
  vendorName: string | null;
  departmentId: string | null;
  departmentName: string | null;
  costCents: number | null;
  marketPriceCents: number | null;
  salePriceCents: number | null;
  hasOverride: boolean;
  marginRatio: number | null;
  marketComparison: "above" | "below" | "at" | null;
  lowConfidenceDepartment: boolean;
  costIncreased: boolean;
}

export function buildCatalogRow(product: CatalogProduct): CatalogRow {
  const salePriceCents = effectiveSalePrice({
    salePriceCents: product.sale_price_cents,
    salePriceOverrideCents: product.sale_price_override_cents,
  });
  return {
    id: product.id,
    barcode: product.barcode,
    name: product.name,
    vendorId: product.vendor_id,
    vendorName: product.vendor_name,
    departmentId: product.department_id,
    departmentName: product.department_name,
    costCents: product.current_cost_cents,
    marketPriceCents: product.market_price_cents,
    salePriceCents,
    hasOverride: product.sale_price_override_cents != null,
    marginRatio: margin(salePriceCents, product.current_cost_cents),
    marketComparison: marketComparison(salePriceCents, product.market_price_cents),
    // A low-confidence AI department assignment; cleared once set manually
    // (manual sets store null confidence — SPEC §5.1).
    lowConfidenceDepartment:
      product.department_id != null &&
      isLowConfidence(product.department_confidence),
    costIncreased: costIncreased({
      currentCostCents: product.current_cost_cents,
      previousCostCents: product.previous_cost_cents,
    }),
  };
}

export type SortColumn =
  | "barcode"
  | "name"
  | "department"
  | "vendor"
  | "cost"
  | "market"
  | "sale"
  | "margin";

export interface CatalogView {
  departmentId?: string | null;
  vendorId?: string | null;
  search?: string;
  sortColumn: SortColumn;
  sortDirection: "asc" | "desc";
}

export const DEFAULT_VIEW: CatalogView = {
  // SPEC §5.1: default sort by highest margin.
  sortColumn: "margin",
  sortDirection: "desc",
};

function matchesSearch(row: CatalogRow, needle: string): boolean {
  const q = needle.trim().toLowerCase();
  if (q === "") return true;
  return (
    row.name.toLowerCase().includes(q) ||
    (row.barcode?.toLowerCase().includes(q) ?? false)
  );
}

/** Nulls sort last regardless of direction, so "no value" never wins a sort. */
function compare(
  a: number | string | null,
  b: number | string | null,
  direction: "asc" | "desc",
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const base = a < b ? -1 : a > b ? 1 : 0;
  return direction === "asc" ? base : -base;
}

function sortKey(row: CatalogRow, column: SortColumn): number | string | null {
  switch (column) {
    case "barcode":
      return row.barcode;
    case "name":
      return row.name.toLowerCase();
    case "department":
      return row.departmentName?.toLowerCase() ?? null;
    case "vendor":
      return row.vendorName?.toLowerCase() ?? null;
    case "cost":
      return row.costCents;
    case "market":
      return row.marketPriceCents;
    case "sale":
      return row.salePriceCents;
    case "margin":
      return row.marginRatio;
  }
}

/** Filter (department, vendor), search (name/barcode), then sort (SPEC §5.1). */
export function applyCatalogView(
  rows: CatalogRow[],
  view: CatalogView,
): CatalogRow[] {
  const filtered = rows.filter((row) => {
    if (view.departmentId != null && row.departmentId !== view.departmentId) {
      return false;
    }
    if (view.vendorId != null && row.vendorId !== view.vendorId) {
      return false;
    }
    return matchesSearch(row, view.search ?? "");
  });

  const sorted = [...filtered].sort((a, b) => {
    const primary = compare(
      sortKey(a, view.sortColumn),
      sortKey(b, view.sortColumn),
      view.sortDirection,
    );
    // Stable tiebreak by name so equal keys keep a deterministic order.
    return primary !== 0
      ? primary
      : compare(a.name.toLowerCase(), b.name.toLowerCase(), "asc");
  });

  return sorted;
}
