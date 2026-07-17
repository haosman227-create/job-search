import { describe, expect, it } from "vitest";
import { computeCostMicroUsd, formatMicroUsd, rateForModel } from "./cost";

describe("computeCostMicroUsd", () => {
  it("prices a sonnet-5 call exactly in integer micro-USD", () => {
    // 10,000 in * 3 + 2,000 out * 15 = 30,000 + 30,000 = 60,000 micro-USD ($0.06)
    expect(
      computeCostMicroUsd({
        model: "claude-sonnet-5",
        inputTokens: 10_000,
        outputTokens: 2_000,
      }),
    ).toBe(60_000);
  });

  it("prices other known models by their rate", () => {
    expect(
      computeCostMicroUsd({
        model: "claude-opus-4-8",
        inputTokens: 1_000,
        outputTokens: 1_000,
      }),
    ).toBe(1_000 * 5 + 1_000 * 25);
  });

  it("falls back to a real rate for an unknown model (never $0)", () => {
    const cost = computeCostMicroUsd({
      model: "some-future-model",
      inputTokens: 100,
      outputTokens: 100,
    });
    expect(cost).toBeGreaterThan(0);
    expect(cost).toBe(rateForModel("claude-sonnet-5").input * 100 + rateForModel("claude-sonnet-5").output * 100);
  });

  it("is zero for a zero-token call", () => {
    expect(
      computeCostMicroUsd({ model: "claude-sonnet-5", inputTokens: 0, outputTokens: 0 }),
    ).toBe(0);
  });
});

describe("formatMicroUsd", () => {
  it("renders micro-USD as a dollar string", () => {
    expect(formatMicroUsd(60_000)).toBe("$0.06");
    expect(formatMicroUsd(1_000_000)).toBe("$1.00");
    expect(formatMicroUsd(12_345)).toBe("$0.012345");
    expect(formatMicroUsd(0)).toBe("$0.00");
  });
});
