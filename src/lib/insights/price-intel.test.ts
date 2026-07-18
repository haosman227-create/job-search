import { describe, expect, it } from "vitest";
import {
  buildDigest,
  detectInsights,
  monthlyQuantity,
  type ProductCostHistory,
} from "./price-intel";

const NOW = "2026-07-18T00:00:00Z";

function history(
  overrides: Partial<ProductCostHistory> = {},
): ProductCostHistory {
  return {
    productId: "p1",
    name: "Mozzarella 1kg",
    salePriceCents: 1800,
    observations: [
      { at: "2026-07-01T00:00:00Z", unitCostCents: 1000, quantity: 20 },
      { at: "2026-07-15T00:00:00Z", unitCostCents: 1140, quantity: 22 },
    ],
    ...overrides,
  };
}

describe("monthlyQuantity", () => {
  it("sums the trailing 30 days", () => {
    expect(
      monthlyQuantity(history().observations, NOW),
    ).toBe(42);
  });

  it("falls back to the latest line when history is old", () => {
    expect(
      monthlyQuantity(
        [
          { at: "2026-01-01T00:00:00Z", unitCostCents: 100, quantity: 7 },
          { at: "2026-02-01T00:00:00Z", unitCostCents: 100, quantity: 9 },
        ],
        NOW,
      ),
    ).toBe(9);
  });
});

describe("detectInsights", () => {
  it("reports a spike with % change and monthly impact at recent volume", () => {
    const [insight] = detectInsights([history()], NOW);
    expect(insight.kind).toBe("price_spike");
    expect(insight.changePct).toBe(14);
    // +140c per unit * 42 units/month
    expect(insight.monthlyImpactCents).toBe(140 * 42);
    expect(insight.summary).toContain("Mozzarella");
    expect(insight.summary).toContain("14%");
  });

  it("compares against the last DIFFERENT price, not the last delivery", () => {
    const [insight] = detectInsights(
      [
        history({
          observations: [
            { at: "2026-07-01T00:00:00Z", unitCostCents: 1000, quantity: 10 },
            { at: "2026-07-10T00:00:00Z", unitCostCents: 1140, quantity: 10 },
            // Same new price again — the change must still be visible.
            { at: "2026-07-15T00:00:00Z", unitCostCents: 1140, quantity: 10 },
          ],
        }),
      ],
      NOW,
    );
    expect(insight.changePct).toBe(14);
  });

  it("ignores noise under the threshold and single observations", () => {
    expect(
      detectInsights(
        [
          history({
            observations: [
              { at: "2026-07-01T00:00:00Z", unitCostCents: 1000, quantity: 10 },
              { at: "2026-07-15T00:00:00Z", unitCostCents: 1020, quantity: 10 },
            ],
          }),
          history({
            productId: "p2",
            observations: [
              { at: "2026-07-15T00:00:00Z", unitCostCents: 1000, quantity: 10 },
            ],
          }),
        ],
        NOW,
      ),
    ).toEqual([]);
  });

  it("celebrates price drops as savings", () => {
    const [insight] = detectInsights(
      [
        history({
          observations: [
            { at: "2026-07-01T00:00:00Z", unitCostCents: 1140, quantity: 20 },
            { at: "2026-07-15T00:00:00Z", unitCostCents: 1000, quantity: 20 },
          ],
        }),
      ],
      NOW,
    );
    expect(insight.kind).toBe("price_drop");
    expect(insight.monthlyImpactCents).toBeLessThan(0);
    expect(insight.summary).toContain("back in your pocket");
  });

  it("flags a margin squeeze when the new cost crushes the sale price", () => {
    const [insight] = detectInsights(
      [
        history({
          // Sale 1200, cost jumps 1000 -> 1140 => margin 5% < 15%.
          salePriceCents: 1200,
        }),
      ],
      NOW,
    );
    expect(insight.kind).toBe("margin_squeeze");
    expect(insight.severity).toBe("high");
    expect(insight.summary).toContain("reprice");
  });

  it("ranks by absolute monthly impact", () => {
    const big = history({
      productId: "big",
      name: "Beef",
      observations: [
        { at: "2026-07-01T00:00:00Z", unitCostCents: 2000, quantity: 100 },
        { at: "2026-07-15T00:00:00Z", unitCostCents: 2400, quantity: 100 },
      ],
    });
    const small = history({ productId: "small" });
    const insights = detectInsights([small, big], NOW);
    expect(insights[0].productId).toBe("big");
  });
});

describe("buildDigest", () => {
  it("summarizes risks with total monthly stake", () => {
    const digest = buildDigest(detectInsights([history()], NOW), NOW);
    expect(digest.headline).toContain("1 price move needs attention");
    expect(digest.headline).toContain("/mo at stake");
    expect(digest.lines).toHaveLength(1);
  });

  it("stays calm when nothing moved", () => {
    const digest = buildDigest([], NOW);
    expect(digest.headline).toBe("Prices held steady this week.");
    expect(digest.lines).toEqual([]);
  });
});
