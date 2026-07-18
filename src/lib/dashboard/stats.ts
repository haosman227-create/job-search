import type { CatalogRow } from "@/lib/catalog/row";
import type { InvoiceListItem } from "@/lib/types";

/**
 * Numbers-first dashboard (SPEC-V2 §3): the handful of figures an operator
 * actually runs the business on, computed from data the app already has. Pure
 * — the page loads rows and passes them in.
 */

/** Margin below this ratio counts as "at risk" (thin for food businesses). */
export const LOW_MARGIN_THRESHOLD = 0.15;

export interface DashboardStats {
  /** Confirmed supplier spend this calendar month, integer cents. */
  monthSpendCents: number;
  invoicesThisMonth: number;
  awaitingReview: number;
  productCount: number;
  /** Mean margin ratio across priced products; null with no priced products. */
  avgMarginRatio: number | null;
  /** Products whose margin is under the risk threshold. */
  marginAtRiskCount: number;
  /** Products whose latest invoice raised their cost. */
  costUpCount: number;
}

function sameMonth(iso: string | null, now: Date): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return (
    d.getUTCFullYear() === now.getUTCFullYear() &&
    d.getUTCMonth() === now.getUTCMonth()
  );
}

export function computeDashboardStats(
  rows: CatalogRow[],
  invoices: InvoiceListItem[],
  now: Date,
): DashboardStats {
  const confirmedThisMonth = invoices.filter(
    (inv) => inv.status === "confirmed" && sameMonth(inv.created_at, now),
  );
  const monthSpendCents = confirmedThisMonth.reduce(
    (sum, inv) => sum + (inv.total_cents ?? 0),
    0,
  );

  const priced = rows.filter((r) => r.marginRatio !== null);
  const avgMarginRatio =
    priced.length === 0
      ? null
      : priced.reduce((sum, r) => sum + (r.marginRatio ?? 0), 0) / priced.length;

  return {
    monthSpendCents,
    invoicesThisMonth: confirmedThisMonth.length,
    awaitingReview: invoices.filter(
      (inv) => inv.status === "needs_review" || inv.status === "partial",
    ).length,
    productCount: rows.length,
    avgMarginRatio,
    marginAtRiskCount: priced.filter(
      (r) => (r.marginRatio ?? 1) < LOW_MARGIN_THRESHOLD,
    ).length,
    costUpCount: rows.filter((r) => r.costIncreased).length,
  };
}
