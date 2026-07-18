import { describe, expect, it } from "vitest";
import { computeDashboardStats } from "./stats";
import type { CatalogRow } from "@/lib/catalog/row";
import type { InvoiceListItem } from "@/lib/types";

const NOW = new Date("2026-07-18T12:00:00Z");

function row(overrides: Partial<CatalogRow>): CatalogRow {
  return {
    id: "p",
    barcode: null,
    name: "x",
    vendorId: null,
    vendorName: null,
    departmentId: null,
    departmentName: null,
    costCents: 100,
    marketPriceCents: null,
    salePriceCents: 150,
    hasOverride: false,
    marginRatio: 0.33,
    marketComparison: null,
    lowConfidenceDepartment: false,
    costIncreased: false,
    ...overrides,
  };
}

function invoice(overrides: Partial<InvoiceListItem>): InvoiceListItem {
  return {
    id: "i",
    business_id: "b",
    vendor_id: null,
    invoice_number: null,
    invoice_date: null,
    total_cents: 1000,
    status: "confirmed",
    uploaded_by: null,
    file_paths: [],
    extraction_model: null,
    extraction_confidence: null,
    header_confidence: {},
    created_at: "2026-07-05T00:00:00Z",
    updated_at: "2026-07-05T00:00:00Z",
    vendor: null,
    line_count: 0,
    ...overrides,
  } as InvoiceListItem;
}

describe("computeDashboardStats", () => {
  it("sums only this month's confirmed spend", () => {
    const stats = computeDashboardStats(
      [],
      [
        invoice({ total_cents: 5000 }),
        invoice({ total_cents: 2500 }),
        // Last month: excluded.
        invoice({ total_cents: 9999, created_at: "2026-06-20T00:00:00Z" }),
        // Not yet confirmed: excluded from spend, counted as awaiting review.
        invoice({ total_cents: 700, status: "needs_review" }),
      ],
      NOW,
    );
    expect(stats.monthSpendCents).toBe(7500);
    expect(stats.invoicesThisMonth).toBe(2);
    expect(stats.awaitingReview).toBe(1);
  });

  it("computes margin health across priced products only", () => {
    const stats = computeDashboardStats(
      [
        row({ marginRatio: 0.4 }),
        row({ marginRatio: 0.1 }), // at risk
        row({ marginRatio: null, salePriceCents: null }), // unpriced, ignored
        row({ marginRatio: 0.2, costIncreased: true }),
      ],
      [],
      NOW,
    );
    expect(stats.productCount).toBe(4);
    expect(stats.avgMarginRatio).toBeCloseTo((0.4 + 0.1 + 0.2) / 3);
    expect(stats.marginAtRiskCount).toBe(1);
    expect(stats.costUpCount).toBe(1);
  });

  it("handles the empty tenant without NaN", () => {
    const stats = computeDashboardStats([], [], NOW);
    expect(stats.monthSpendCents).toBe(0);
    expect(stats.avgMarginRatio).toBeNull();
    expect(stats.marginAtRiskCount).toBe(0);
  });
});
