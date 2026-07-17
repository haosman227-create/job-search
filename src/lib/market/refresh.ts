import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordUsage } from "@/lib/usage/record";
import { shouldRefreshMarketPrice } from "./policy";
import { estimateMarketPrice } from "./client";

interface MarketProductRow {
  id: string;
  business_id: string;
  name: string;
  barcode: string | null;
  market_price_cents: number | null;
  market_price_fetched_at: string | null;
  current_cost_cents: number | null;
  previous_cost_cents: number | null;
  department: { name: string } | { name: string }[] | null;
}

function departmentName(row: MarketProductRow): string | null {
  const dep = Array.isArray(row.department) ? row.department[0] : row.department;
  return dep?.name ?? null;
}

/**
 * Applies the refresh policy to one product and, if due, fetches a fresh
 * estimate and caches it with a timestamp. Returns whether it refreshed.
 * Best-effort: any failure leaves the existing estimate untouched.
 */
export async function refreshMarketPriceForProduct(
  supabase: SupabaseClient,
  productId: string,
  options: { manual?: boolean } = {},
): Promise<boolean> {
  const { data } = await supabase
    .from("product")
    .select(
      `id, business_id, name, barcode, market_price_cents, market_price_fetched_at,
       current_cost_cents, previous_cost_cents, department:department_id(name)`,
    )
    .eq("id", productId)
    .maybeSingle();
  if (!data) return false;
  const product = data as unknown as MarketProductRow;

  const due = shouldRefreshMarketPrice({
    marketPriceCents: product.market_price_cents,
    marketPriceFetchedAt: product.market_price_fetched_at,
    previousCostCents: product.previous_cost_cents,
    currentCostCents: product.current_cost_cents,
    manual: options.manual ?? false,
  });
  if (!due) return false;

  try {
    const estimate = await estimateMarketPrice({
      name: product.name,
      barcode: product.barcode,
      departmentName: departmentName(product),
    });
    // Meter the call on the write path before caching the result — a
    // market-pricing call is billable spend even when it returns null.
    await recordUsage({
      businessId: product.business_id,
      userId: null,
      operation: "market_pricing",
      usage: estimate.usage,
    });
    await supabase
      .from("product")
      .update({
        market_price_cents: estimate.priceCents,
        market_price_fetched_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", productId);
    return true;
  } catch {
    // Leave the cached estimate as-is on any model/storage failure.
    return false;
  }
}

/** Batch refresh (used by the confirm background job) — sequential to be gentle. */
export async function refreshMarketPricesForProducts(
  supabase: SupabaseClient,
  productIds: string[],
): Promise<void> {
  for (const id of productIds) {
    await refreshMarketPriceForProduct(supabase, id);
  }
}
