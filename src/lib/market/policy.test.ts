import { describe, expect, it } from "vitest";
import { shouldRefreshMarketPrice, type RefreshInputs } from "./policy";

function inputs(overrides: Partial<RefreshInputs> = {}): RefreshInputs {
  return {
    marketPriceCents: 500,
    marketPriceFetchedAt: "2026-07-01T00:00:00Z",
    previousCostCents: 100,
    currentCostCents: 100,
    manual: false,
    ...overrides,
  };
}

describe("shouldRefreshMarketPrice", () => {
  it("always refreshes on a manual request", () => {
    expect(shouldRefreshMarketPrice(inputs({ manual: true }))).toBe(true);
    // Even when nothing else would trigger it.
    expect(
      shouldRefreshMarketPrice(inputs({ manual: true, currentCostCents: 100 })),
    ).toBe(true);
  });

  it("fetches once when never estimated and a cost exists", () => {
    expect(
      shouldRefreshMarketPrice(
        inputs({ marketPriceCents: null, marketPriceFetchedAt: null }),
      ),
    ).toBe(true);
  });

  it("does not fetch a never-estimated product that has no cost", () => {
    expect(
      shouldRefreshMarketPrice(
        inputs({
          marketPriceCents: null,
          marketPriceFetchedAt: null,
          currentCostCents: null,
        }),
      ),
    ).toBe(false);
  });

  it("skips a trivial cost change", () => {
    // 100 -> 105 = 5%, below the 10% threshold.
    expect(
      shouldRefreshMarketPrice(
        inputs({ previousCostCents: 100, currentCostCents: 105 }),
      ),
    ).toBe(false);
  });

  it("refreshes a material cost change (>= threshold)", () => {
    // 100 -> 110 = exactly 10%.
    expect(
      shouldRefreshMarketPrice(
        inputs({ previousCostCents: 100, currentCostCents: 110 }),
      ),
    ).toBe(true);
    // A large drop counts too.
    expect(
      shouldRefreshMarketPrice(
        inputs({ previousCostCents: 200, currentCostCents: 100 }),
      ),
    ).toBe(true);
  });

  it("does not refresh when there's no prior cost to compare", () => {
    expect(
      shouldRefreshMarketPrice(inputs({ previousCostCents: null })),
    ).toBe(false);
  });

  it("handles a zero prior cost without dividing by zero", () => {
    expect(
      shouldRefreshMarketPrice(
        inputs({ previousCostCents: 0, currentCostCents: 50 }),
      ),
    ).toBe(true);
    expect(
      shouldRefreshMarketPrice(
        inputs({ previousCostCents: 0, currentCostCents: 0 }),
      ),
    ).toBe(false);
  });
});
