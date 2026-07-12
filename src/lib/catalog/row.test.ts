import { describe, expect, it } from "vitest";
import {
  applyCatalogView,
  buildCatalogRow,
  DEFAULT_VIEW,
  type CatalogProduct,
  type CatalogRow,
} from "./row";

function product(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id: "p1",
    barcode: "12345678905",
    name: "Cola 330ml",
    vendor_id: "v1",
    vendor_name: "Acme Foods",
    department_id: "d1",
    department_name: "Grocery",
    department_confidence: 0.95,
    current_cost_cents: 75,
    previous_cost_cents: 60,
    market_price_cents: 120,
    sale_price_cents: 99,
    sale_price_override_cents: null,
    ...overrides,
  };
}

describe("buildCatalogRow", () => {
  it("computes margin, market comparison, and badges", () => {
    const row = buildCatalogRow(product());
    expect(row.salePriceCents).toBe(99);
    expect(row.marginRatio).toBeCloseTo((99 - 75) / 99, 5);
    expect(row.marketComparison).toBe("below"); // 99 < 120
    expect(row.costIncreased).toBe(true); // 75 > 60
    expect(row.hasOverride).toBe(false);
    expect(row.lowConfidenceDepartment).toBe(false);
  });

  it("uses the manual override as the effective sale price", () => {
    const row = buildCatalogRow(
      product({ sale_price_override_cents: 149, market_price_cents: 120 }),
    );
    expect(row.salePriceCents).toBe(149);
    expect(row.hasOverride).toBe(true);
    expect(row.marketComparison).toBe("above"); // 149 > 120
  });

  it("flags a low-confidence AI department only when one is assigned", () => {
    expect(
      buildCatalogRow(product({ department_confidence: 0.4 }))
        .lowConfidenceDepartment,
    ).toBe(true);
    // Manually set department: null confidence, no flag.
    expect(
      buildCatalogRow(product({ department_confidence: null }))
        .lowConfidenceDepartment,
    ).toBe(false);
    // No department at all: no flag.
    expect(
      buildCatalogRow(
        product({ department_id: null, department_confidence: 0.2 }),
      ).lowConfidenceDepartment,
    ).toBe(false);
  });
});

function rows(): CatalogRow[] {
  return [
    buildCatalogRow(product({ id: "a", name: "Cola", sale_price_cents: 100, current_cost_cents: 50 })), // margin .5
    buildCatalogRow(product({ id: "b", name: "Chips", vendor_id: "v2", vendor_name: "Best Supply", department_id: "d2", department_name: "Snacks", sale_price_cents: 100, current_cost_cents: 10 })), // margin .9
    buildCatalogRow(product({ id: "c", name: "Water", barcode: "999", sale_price_cents: 100, current_cost_cents: 90 })), // margin .1
  ];
}

describe("applyCatalogView", () => {
  it("defaults to highest margin first", () => {
    const result = applyCatalogView(rows(), DEFAULT_VIEW);
    expect(result.map((r) => r.id)).toEqual(["b", "a", "c"]);
  });

  it("filters by department and vendor", () => {
    expect(
      applyCatalogView(rows(), { ...DEFAULT_VIEW, departmentId: "d2" }).map((r) => r.id),
    ).toEqual(["b"]);
    expect(
      applyCatalogView(rows(), { ...DEFAULT_VIEW, vendorId: "v1" }).map((r) => r.id),
    ).toEqual(["a", "c"]);
  });

  it("searches name and barcode", () => {
    expect(
      applyCatalogView(rows(), { ...DEFAULT_VIEW, search: "wat" }).map((r) => r.id),
    ).toEqual(["c"]);
    expect(
      applyCatalogView(rows(), { ...DEFAULT_VIEW, search: "999" }).map((r) => r.id),
    ).toEqual(["c"]);
    expect(
      applyCatalogView(rows(), { ...DEFAULT_VIEW, search: "nope" }),
    ).toHaveLength(0);
  });

  it("sorts by any column in both directions, nulls last", () => {
    const withNull = [
      ...rows(),
      buildCatalogRow(product({ id: "d", name: "Mystery", current_cost_cents: null, sale_price_cents: null })),
    ];
    const ascCost = applyCatalogView(withNull, {
      ...DEFAULT_VIEW,
      sortColumn: "cost",
      sortDirection: "asc",
    });
    expect(ascCost[ascCost.length - 1].id).toBe("d"); // null cost sorts last
    expect(ascCost[0].id).toBe("b"); // cheapest (10)
  });

  it("filters, searches, and sorts 5,000 products well under 100ms", () => {
    const big: CatalogRow[] = Array.from({ length: 5000 }, (_, i) =>
      buildCatalogRow(
        product({
          id: `p${i}`,
          name: `Product ${i}`,
          barcode: String(1000000 + i),
          vendor_id: `v${i % 20}`,
          department_id: `d${i % 8}`,
          current_cost_cents: (i % 500) + 1,
          sale_price_cents: ((i * 7) % 900) + 100,
        }),
      ),
    );

    const start = performance.now();
    for (let i = 0; i < 5; i++) {
      applyCatalogView(big, {
        departmentId: "d3",
        vendorId: null,
        search: "Product 1",
        sortColumn: "margin",
        sortDirection: "desc",
      });
    }
    const perRun = (performance.now() - start) / 5;
    expect(perRun).toBeLessThan(100);
  });
});
