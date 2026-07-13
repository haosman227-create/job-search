"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { attachProductBarcode } from "@/app/(app)/actions";
import type { CatalogRow } from "@/lib/catalog/row";

/**
 * Barcode column. Barcoded products show the code; barcode-less ones offer an
 * inline "attach" (SPEC §7.2) — attaching a code that already exists merges
 * the two products.
 */
export function BarcodeCell({ row }: { row: CatalogRow }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (row.barcode) {
    return <span className="tabular-nums text-muted-foreground">{row.barcode}</span>;
  }

  if (!editing) {
    return (
      <button
        type="button"
        className="text-xs text-muted-foreground underline hover:text-foreground"
        onClick={() => {
          setError(null);
          setEditing(true);
        }}
      >
        + barcode
      </button>
    );
  }

  function save() {
    const barcode = value.trim();
    if (!barcode) {
      setEditing(false);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await attachProductBarcode({ productId: row.id, barcode });
      if (result.outcome === "invalid") {
        setError(result.message);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        autoFocus
        value={value}
        inputMode="numeric"
        placeholder="Scan or type…"
        className="w-32 rounded border bg-background px-2 py-1 text-sm tabular-nums"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
        onBlur={save}
        disabled={isPending}
        aria-label={`Attach barcode to ${row.name}`}
      />
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}
