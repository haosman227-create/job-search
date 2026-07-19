import { describe, expect, it } from "vitest";
import { costRecipe, type IngredientInput } from "./costing";

function ing(overrides: Partial<IngredientInput> = {}): IngredientInput {
  return {
    productId: "p1",
    productName: "Mozzarella 1kg",
    quantity: 0.25,
    unitCostCents: 1140,
    ...overrides,
  };
}

describe("costRecipe", () => {
  it("computes plate cost, margin, and cost ratio in integer cents", () => {
    const cost = costRecipe(
      [
        ing(), // 0.25 * 1140 = 285
        ing({ productId: "p2", productName: "Flour", quantity: 0.3, unitCostCents: 200 }), // 60
        ing({ productId: "p3", productName: "Tomato", quantity: 0.2, unitCostCents: 350 }), // 70
      ],
      1600,
    );
    expect(cost.plateCostCents).toBe(285 + 60 + 70); // 415
    expect(cost.missingCostCount).toBe(0);
    expect(cost.marginRatio).toBeCloseTo((1600 - 415) / 1600);
    expect(cost.costRatio).toBeCloseTo(415 / 1600);
  });

  it("rounds each fractional line once, never floats the sum", () => {
    const cost = costRecipe(
      [ing({ quantity: 0.333, unitCostCents: 100 })], // 33.3 -> 33
      1000,
    );
    expect(cost.plateCostCents).toBe(33);
    expect(Number.isInteger(cost.plateCostCents)).toBe(true);
  });

  it("marks unknown ingredient costs and withholds margin until complete", () => {
    const cost = costRecipe(
      [ing(), ing({ productId: "p2", unitCostCents: null })],
      1600,
    );
    expect(cost.plateCostCents).toBe(285); // known part only
    expect(cost.missingCostCount).toBe(1);
    expect(cost.marginRatio).toBeNull();
    expect(cost.costRatio).toBeNull();
  });

  it("withholds ratios without a menu price or ingredients", () => {
    expect(costRecipe([ing()], null).marginRatio).toBeNull();
    expect(costRecipe([], 1600).marginRatio).toBeNull();
  });
});
