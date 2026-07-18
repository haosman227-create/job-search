import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/api/errors";
import { setLogSink } from "@/lib/log/logger";
import {
  refreshMarketPriceForProduct,
  refreshMarketPricesForProducts,
} from "./refresh";

/**
 * Wiring tests for the market chokepoint: a guardrail denial must stop the
 * paid call BEFORE it happens and leave the product untouched — on the manual
 * path and on the post-confirm batch (the path the audit found unguarded).
 */

const BIZ = "b1111111-1111-4111-8111-111111111111";

// A refreshable product row (no cached estimate → policy says due).
const dueProduct = {
  id: "p1",
  business_id: BIZ,
  name: "Cola",
  barcode: null,
  market_price_cents: null,
  market_price_fetched_at: null,
  current_cost_cents: 100,
  previous_cost_cents: null,
  department: null,
};

function fakeSupabase(track: { loads: number; updates: number }): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            track.loads += 1;
            return { data: dueProduct };
          },
        }),
      }),
      update: () => {
        track.updates += 1;
        return { eq: async () => ({ error: null }) };
      },
    }),
  } as unknown as SupabaseClient;
}

const deny = vi.fn(async () => {
  throw new ApiError("quota_exceeded", "over the market cap", {
    reason: "market_quota",
  });
});

describe("refreshMarketPriceForProduct", () => {
  it("propagates a guardrail denial and never touches the product", async () => {
    const track = { loads: 0, updates: 0 };
    await expect(
      refreshMarketPriceForProduct(fakeSupabase(track), "p1", { guard: deny }),
    ).rejects.toMatchObject({ code: "quota_exceeded" });
    expect(deny).toHaveBeenCalledWith(BIZ);
    expect(track.updates).toBe(0);
  });
});

describe("refreshMarketPricesForProducts", () => {
  it("stops the batch at the first guardrail denial instead of hammering", async () => {
    const restore = setLogSink(() => {});
    try {
      const track = { loads: 0, updates: 0 };
      await refreshMarketPricesForProducts(
        fakeSupabase(track),
        ["p1", "p2", "p3"],
        async () => {
          throw new ApiError("service_unavailable", "kill switch", {
            reason: "service_disabled",
          });
        },
      );
      // Only the first product was even attempted; the batch resolved quietly.
      expect(track.loads).toBe(1);
      expect(track.updates).toBe(0);
    } finally {
      restore();
    }
  });

  it("lets a non-guardrail error propagate", async () => {
    const track = { loads: 0, updates: 0 };
    await expect(
      refreshMarketPricesForProducts(fakeSupabase(track), ["p1"], async () => {
        throw new Error("unexpected");
      }),
    ).rejects.toThrow("unexpected");
  });
});
