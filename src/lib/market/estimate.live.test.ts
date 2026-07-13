import { describe, expect, it } from "vitest";

/**
 * Live smoke test for market-price estimation. Opt-in:
 *   LIVE_MARKET_SMOKE=1 ANTHROPIC_API_KEY=... npx vitest run estimate.live
 * Skipped in CI (no API key).
 */
const enabled =
  process.env.LIVE_MARKET_SMOKE === "1" && !!process.env.ANTHROPIC_API_KEY;

describe.skipIf(!enabled)("estimateMarketPrice (live)", () => {
  it("returns a plausible retail price for a common product", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "unused";
    process.env.SUPABASE_SERVICE_ROLE_KEY ??= "unused";
    const { estimateMarketPrice } = await import("./client");

    const cents = await estimateMarketPrice({
      name: "Coca-Cola 330ml can",
      barcode: "5449000000996",
      departmentName: "Beverages",
    });

    expect(cents).not.toBeNull();
    // A single can retails roughly $0.50–$5.00; assert a sane range.
    expect(cents!).toBeGreaterThan(30);
    expect(cents!).toBeLessThan(1000);
  }, 60_000);
});
