import { describe, expect, it } from "vitest";
import {
  computeSalePrice,
  costIncreased,
  effectiveSalePrice,
  marketComparison,
  psychologicalRound,
} from "./pricing";

describe("psychologicalRound", () => {
  it("rounds prices >= $1 to the nearest .99, ties up", () => {
    expect(psychologicalRound(199)).toBe(199); // already there
    expect(psychologicalRound(200)).toBe(199); // 1 cent down
    expect(psychologicalRound(248)).toBe(199); // nearest is below
    expect(psychologicalRound(249)).toBe(299); // tie goes up
    expect(psychologicalRound(250)).toBe(299);
    expect(psychologicalRound(100)).toBe(99); // crosses the dollar boundary down
  });

  it("rounds prices under $1 to the nearest 9-cent ending", () => {
    expect(psychologicalRound(43)).toBe(39);
    expect(psychologicalRound(45)).toBe(49);
    expect(psychologicalRound(9)).toBe(9);
    expect(psychologicalRound(1)).toBe(9); // never rounds to zero
    expect(psychologicalRound(99)).toBe(99);
  });

  it("never returns less than the floor", () => {
    expect(psychologicalRound(200, 200)).toBe(299);
    expect(psychologicalRound(130, 100)).toBe(199); // nearest .99 (99) is below cost
    expect(psychologicalRound(45, 48)).toBe(49);
  });

  it("returns 0 for non-positive prices", () => {
    expect(psychologicalRound(0)).toBe(0);
    expect(psychologicalRound(-50)).toBe(0);
  });
});

describe("computeSalePrice", () => {
  it("applies the department markup then rounds", () => {
    // $1.00 cost, 30% markup → $1.30 raw → $1.99 (nearest .99 below cost).
    expect(computeSalePrice(100, 0.3)).toBe(199);
    // $10.00 cost, 30% markup → $13.00 raw → $12.99.
    expect(computeSalePrice(1000, 0.3)).toBe(1299);
    // $8.40 cost, 12% markup (tobacco) → $9.41 raw → nearest .99 is $8.99,
    // still above cost, so it stands.
    expect(computeSalePrice(840, 0.12)).toBe(899);
    // $0.60 cost, 40% markup → $0.84 → $0.89.
    expect(computeSalePrice(60, 0.4)).toBe(89);
  });

  it("never prices below cost, even when rounding pulls that way", () => {
    for (const [cost, markup] of [
      [100, 0],
      [199, 0.05],
      [95, 0.02],
      [51, 0],
    ] as const) {
      expect(computeSalePrice(cost, markup)).toBeGreaterThanOrEqual(cost);
    }
  });

  it("handles zero cost and rejects bad markups", () => {
    expect(computeSalePrice(0, 0.3)).toBe(0);
    expect(() => computeSalePrice(100, -0.1)).toThrow(/targetMarkup/);
    expect(() => computeSalePrice(100, Number.NaN)).toThrow(/targetMarkup/);
  });
});

describe("effectiveSalePrice", () => {
  it("prefers the explicit override until cleared", () => {
    expect(
      effectiveSalePrice({ salePriceCents: 199, salePriceOverrideCents: 149 }),
    ).toBe(149);
    expect(
      effectiveSalePrice({ salePriceCents: 199, salePriceOverrideCents: null }),
    ).toBe(199);
    expect(
      effectiveSalePrice({ salePriceCents: null, salePriceOverrideCents: null }),
    ).toBeNull();
  });
});

describe("costIncreased", () => {
  it("flags only genuine increases", () => {
    expect(costIncreased({ currentCostCents: 110, previousCostCents: 100 })).toBe(true);
    expect(costIncreased({ currentCostCents: 100, previousCostCents: 100 })).toBe(false);
    expect(costIncreased({ currentCostCents: 90, previousCostCents: 100 })).toBe(false);
    expect(costIncreased({ currentCostCents: 110, previousCostCents: null })).toBe(false);
  });
});

describe("marketComparison", () => {
  it("classifies sale price against the market estimate", () => {
    expect(marketComparison(299, 249)).toBe("above");
    expect(marketComparison(199, 249)).toBe("below");
    expect(marketComparison(249, 249)).toBe("at");
    expect(marketComparison(null, 249)).toBeNull();
    expect(marketComparison(249, null)).toBeNull();
  });
});
