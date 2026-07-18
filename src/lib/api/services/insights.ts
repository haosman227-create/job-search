import "server-only";
import { effectiveSalePrice } from "@/lib/domain";
import {
  buildDigest,
  detectInsights,
  type Insight,
  type ProductCostHistory,
} from "@/lib/insights/price-intel";
import type { ApiContext } from "../context";

/**
 * Price-intelligence loader (V2-2): turns the tenant's confirmed invoice
 * lines into per-product cost histories and runs the pure engine. Reads only
 * through the RLS-scoped client, filtered by businessId at the boundary.
 */

interface LineRow {
  product_id: string;
  unit_cost_cents: number;
  quantity: number | null;
  created_at: string;
  invoice: { status: string } | { status: string }[] | null;
  product:
    | {
        name: string;
        sale_price_cents: number | null;
        sale_price_override_cents: number | null;
      }
    | {
        name: string;
        sale_price_cents: number | null;
        sale_price_override_cents: number | null;
      }[]
    | null;
}

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

async function loadHistories(ctx: ApiContext): Promise<ProductCostHistory[]> {
  const { data } = await ctx.supabase
    .from("invoice_line")
    .select(
      `product_id, unit_cost_cents, quantity, created_at,
       invoice:invoice_id(status),
       product:product_id(name, sale_price_cents, sale_price_override_cents)`,
    )
    .eq("business_id", ctx.businessId)
    .not("product_id", "is", null)
    .not("unit_cost_cents", "is", null)
    .order("created_at", { ascending: true });

  const byProduct = new Map<string, ProductCostHistory>();
  for (const raw of (data ?? []) as unknown as LineRow[]) {
    // Only confirmed invoices are truth — extractions in review don't move
    // the operator's numbers.
    if (one(raw.invoice)?.status !== "confirmed") continue;
    const product = one(raw.product);
    if (!product) continue;

    let entry = byProduct.get(raw.product_id);
    if (!entry) {
      entry = {
        productId: raw.product_id,
        name: product.name,
        salePriceCents: effectiveSalePrice({
          salePriceCents: product.sale_price_cents,
          salePriceOverrideCents: product.sale_price_override_cents,
        }),
        observations: [],
      };
      byProduct.set(raw.product_id, entry);
    }
    entry.observations.push({
      at: raw.created_at,
      unitCostCents: raw.unit_cost_cents,
      quantity: raw.quantity ?? 1,
    });
  }
  return [...byProduct.values()];
}

export async function getInsights(ctx: ApiContext): Promise<Insight[]> {
  const histories = await loadHistories(ctx);
  return detectInsights(histories, new Date().toISOString());
}

export async function getDigest(ctx: ApiContext) {
  const insights = await getInsights(ctx);
  return buildDigest(insights, new Date().toISOString());
}
