"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCents } from "@/lib/domain";
import { apiJson } from "@/lib/api/client";
import type { CatalogRow } from "@/lib/catalog/row";

/**
 * AI market-price estimate (SPEC §4): clearly labeled as an estimate, with a
 * manual refresh. The above/below-market signal lives on the sale-price cell.
 */
export function MarketPriceCell({ row }: { row: CatalogRow }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function refresh() {
    startTransition(async () => {
      await apiJson(`/api/v1/products/${row.id}/market-refresh`, "POST").catch(
        () => {},
      );
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      <span
        className="tabular-nums text-muted-foreground"
        title="AI estimate of typical retail price"
      >
        {row.marketPriceCents != null ? formatCents(row.marketPriceCents) : "—"}
      </span>
      <button
        type="button"
        disabled={isPending}
        onClick={refresh}
        className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
        title="Refresh AI estimate"
        aria-label={`Refresh market estimate for ${row.name}`}
      >
        {isPending ? "…" : "↻"}
      </button>
    </div>
  );
}
