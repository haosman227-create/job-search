import { describe, expect, it } from "vitest";
import {
  computeDepartmentUpdate,
  computeOverrideUpdate,
} from "./price-update";

describe("computeOverrideUpdate", () => {
  it("sets the override and leaves the computed price alone", () => {
    expect(
      computeOverrideUpdate({
        overrideCents: 149,
        currentCostCents: 75,
        targetMarkup: 0.3,
      }),
    ).toEqual({ sale_price_override_cents: 149 });
  });

  it("clears the override and recomputes the standard price", () => {
    expect(
      computeOverrideUpdate({
        overrideCents: null,
        currentCostCents: 75,
        targetMarkup: 0.3,
      }),
    ).toEqual({ sale_price_override_cents: null, sale_price_cents: 99 });
  });

  it("clears the override but skips recompute when cost or markup is unknown", () => {
    expect(
      computeOverrideUpdate({
        overrideCents: null,
        currentCostCents: null,
        targetMarkup: 0.3,
      }),
    ).toEqual({ sale_price_override_cents: null });
    expect(
      computeOverrideUpdate({
        overrideCents: null,
        currentCostCents: 75,
        targetMarkup: null,
      }),
    ).toEqual({ sale_price_override_cents: null });
  });
});

describe("computeDepartmentUpdate", () => {
  it("nulls confidence and recomputes the price for the new markup", () => {
    expect(
      computeDepartmentUpdate({
        departmentId: "dep-1",
        currentCostCents: 75,
        targetMarkup: 0.3,
        hasOverride: false,
      }),
    ).toEqual({
      department_id: "dep-1",
      department_confidence: null,
      sale_price_cents: 99,
    });
  });

  it("never recomputes while a manual override is in force", () => {
    expect(
      computeDepartmentUpdate({
        departmentId: "dep-1",
        currentCostCents: 75,
        targetMarkup: 0.3,
        hasOverride: true,
      }),
    ).toEqual({ department_id: "dep-1", department_confidence: null });
  });

  it("clears the department without recompute", () => {
    expect(
      computeDepartmentUpdate({
        departmentId: null,
        currentCostCents: 75,
        targetMarkup: null,
        hasOverride: false,
      }),
    ).toEqual({ department_id: null, department_confidence: null });
  });
});
