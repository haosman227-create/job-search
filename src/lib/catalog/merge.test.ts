import { describe, expect, it, vi } from "vitest";
import {
  attachBarcode,
  orderLines,
  planCostAfterMerge,
  type BarcodeAttachDeps,
  type MergeLine,
  type MergeProduct,
} from "./merge";
import { normalizeBarcode } from "@/lib/domain";

const lines = (specs: [cost: number | null, date: string, created: string][]): MergeLine[] =>
  specs.map(([unit_cost_cents, invoice_date, created_at]) => ({
    unit_cost_cents,
    invoice_date,
    created_at,
  }));

describe("orderLines", () => {
  it("orders by invoice date then insertion order", () => {
    const ordered = orderLines(
      lines([
        [100, "2026-07-02", "2026-07-02T00:00:00Z"],
        [90, "2026-07-01", "2026-07-01T00:00:00Z"],
        [110, "2026-07-02", "2026-07-02T01:00:00Z"],
      ]),
    );
    expect(ordered.map((l) => l.unit_cost_cents)).toEqual([90, 100, 110]);
  });
});

describe("planCostAfterMerge", () => {
  it("takes newest as current and prior as previous, recomputing price", () => {
    const plan = planCostAfterMerge(
      lines([
        [1000, "2026-07-01", "2026-07-01T00:00:00Z"],
        [1200, "2026-07-05", "2026-07-05T00:00:00Z"],
      ]),
      0.3,
      false,
    );
    expect(plan).toEqual({
      previous_cost_cents: 1000,
      current_cost_cents: 1200,
      sale_price_cents: 1599, // 1200 * 1.3 = 1560 -> .99
    });
  });

  it("leaves the computed price alone when an override holds", () => {
    const plan = planCostAfterMerge(
      lines([[1000, "2026-07-01", "2026-07-01T00:00:00Z"]]),
      0.3,
      true,
    );
    expect(plan).toEqual({ previous_cost_cents: null, current_cost_cents: 1000 });
  });

  it("ignores lines without a cost", () => {
    const plan = planCostAfterMerge(
      lines([
        [null, "2026-07-01", "2026-07-01T00:00:00Z"],
        [500, "2026-07-02", "2026-07-02T00:00:00Z"],
      ]),
      null,
      false,
    );
    expect(plan.current_cost_cents).toBe(500);
    expect(plan.previous_cost_cents).toBeNull();
  });
});

function stubDeps(overrides: Partial<BarcodeAttachDeps> = {}): BarcodeAttachDeps {
  const barcodeless: MergeProduct = {
    id: "p-name",
    business_id: "biz",
    barcode: null,
    department_id: "dep",
    sale_price_override_cents: null,
  };
  return {
    normalizeBarcode,
    loadProduct: vi.fn(async () => barcodeless),
    findProductByBarcode: vi.fn(async () => null),
    getDepartmentMarkup: vi.fn(async () => 0.3),
    listLines: vi.fn(async () => lines([[1200, "2026-07-05", "2026-07-05T00:00:00Z"]])),
    setBarcode: vi.fn(async () => {}),
    repointLines: vi.fn(async () => {}),
    updateCost: vi.fn(async () => {}),
    deleteProduct: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("attachBarcode", () => {
  it("attaches a barcode when no twin exists", async () => {
    const deps = stubDeps();
    const result = await attachBarcode(deps, {
      productId: "p-name",
      barcode: "0 12345 67890 5",
    });
    expect(result).toEqual({ outcome: "attached", productId: "p-name" });
    expect(deps.setBarcode).toHaveBeenCalledWith("p-name", "12345678905");
    expect(deps.repointLines).not.toHaveBeenCalled();
  });

  it("merges into an existing barcoded twin, preserving history", async () => {
    const twin: MergeProduct = {
      id: "p-barcode",
      business_id: "biz",
      barcode: "12345678905",
      department_id: "dep",
      sale_price_override_cents: null,
    };
    const deps = stubDeps({
      findProductByBarcode: vi.fn(async () => twin),
      listLines: vi.fn(async () =>
        lines([
          [1000, "2026-07-01", "2026-07-01T00:00:00Z"],
          [1200, "2026-07-05", "2026-07-05T00:00:00Z"],
        ]),
      ),
    });

    const result = await attachBarcode(deps, {
      productId: "p-name",
      barcode: "12345678905",
    });
    expect(result).toEqual({
      outcome: "merged",
      survivingProductId: "p-barcode",
      removedProductId: "p-name",
    });
    expect(deps.repointLines).toHaveBeenCalledWith("p-name", "p-barcode");
    expect(deps.updateCost).toHaveBeenCalledWith("p-barcode", {
      previous_cost_cents: 1000,
      current_cost_cents: 1200,
      sale_price_cents: 1599,
    });
    expect(deps.deleteProduct).toHaveBeenCalledWith("p-name");
  });

  it("rejects an invalid barcode or a product that already has one", async () => {
    expect(
      await attachBarcode(stubDeps(), { productId: "p-name", barcode: "n/a" }),
    ).toMatchObject({ outcome: "invalid" });

    const withBarcode = stubDeps({
      loadProduct: vi.fn(async () => ({
        id: "p",
        business_id: "biz",
        barcode: "999999",
        department_id: null,
        sale_price_override_cents: null,
      })),
    });
    expect(
      await attachBarcode(withBarcode, { productId: "p", barcode: "12345678905" }),
    ).toMatchObject({ outcome: "invalid" });
  });
});
