"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { formatCents } from "@/lib/domain";
import { centsToInput, inputToCents } from "@/lib/catalog/money-input";
import { apiJson } from "@/lib/api/client";
import type { CatalogRow } from "@/lib/catalog/row";

/**
 * Inline sale-price editor (SPEC §5.1). Saving sets a manual override marked
 * with a dot; the ✕ clears it and the price reverts to the computed value.
 * Above/below-market is shown with an arrow.
 */
export function SalePriceCell({ row }: { row: CatalogRow }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(centsToInput(row.salePriceCents));
  const [isPending, startTransition] = useTransition();

  function save() {
    const cents = inputToCents(value);
    setEditing(false);
    if (cents == null || cents === row.salePriceCents) return;
    startTransition(async () => {
      await apiJson(`/api/v1/products/${row.id}`, "PATCH", {
        salePriceOverrideCents: cents,
      }).catch(() => {});
      router.refresh();
    });
  }

  function clearOverride() {
    startTransition(async () => {
      await apiJson(`/api/v1/products/${row.id}`, "PATCH", {
        salePriceOverrideCents: null,
      }).catch(() => {});
      router.refresh();
    });
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        inputMode="decimal"
        className="w-20 rounded border bg-background px-2 py-1 text-right text-sm tabular-nums"
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
        aria-label={`Edit sale price for ${row.name}`}
      />
    );
  }

  const marker =
    row.marketComparison === "above"
      ? { symbol: "↑", cls: "text-emerald-600", title: "Above market" }
      : row.marketComparison === "below"
        ? { symbol: "↓", cls: "text-amber-600", title: "Below market" }
        : null;

  return (
    <div className="flex items-center justify-end gap-1">
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          setValue(centsToInput(row.salePriceCents));
          setEditing(true);
        }}
        className={cn(
          "tabular-nums hover:underline",
          row.hasOverride && "font-medium",
        )}
        aria-label={`Sale price for ${row.name}`}
      >
        {row.salePriceCents != null ? formatCents(row.salePriceCents) : "—"}
      </button>
      {marker ? (
        <span className={marker.cls} title={marker.title}>
          {marker.symbol}
        </span>
      ) : null}
      {row.hasOverride ? (
        <button
          type="button"
          disabled={isPending}
          onClick={clearOverride}
          className="text-xs text-muted-foreground hover:text-destructive"
          title="Manual override — click to clear"
        >
          ●✕
        </button>
      ) : null}
    </div>
  );
}
