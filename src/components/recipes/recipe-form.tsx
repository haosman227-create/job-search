"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiJson, ApiClientError } from "@/lib/api/client";
import { formatCents } from "@/lib/domain";
import { Button } from "@/components/ui/button";

/**
 * One-form recipe editor (V2-3): name, menu price, ingredient rows. The live
 * plate cost previews as rows change — the same math the server uses.
 */

export interface ProductOption {
  id: string;
  name: string;
  costCents: number | null;
}

interface Row {
  productId: string;
  quantity: string;
}

export interface RecipeFormInitial {
  id?: string;
  name: string;
  menuPrice: string;
  rows: Row[];
}

export function RecipeForm({
  products,
  initial,
}: {
  products: ProductOption[];
  initial?: RecipeFormInitial;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [menuPrice, setMenuPrice] = useState(initial?.menuPrice ?? "");
  const [rows, setRows] = useState<Row[]>(
    initial?.rows?.length ? initial.rows : [{ productId: "", quantity: "1" }],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const costById = new Map(products.map((p) => [p.id, p.costCents]));
  const previewCents = rows.reduce((sum, row) => {
    const cost = costById.get(row.productId);
    const qty = Number(row.quantity);
    if (cost == null || !Number.isFinite(qty) || qty <= 0) return sum;
    return sum + Math.round(qty * cost);
  }, 0);

  function setRow(index: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const payload = {
        name,
        menuPriceCents:
          menuPrice.trim() === ""
            ? null
            : Math.round(Number(menuPrice) * 100),
        ingredients: rows
          .filter((r) => r.productId)
          .map((r) => ({ productId: r.productId, quantity: Number(r.quantity) })),
      };
      if (initial?.id) {
        await apiJson(`/api/v1/recipes/${initial.id}`, "PATCH", payload);
      } else {
        await apiJson("/api/v1/recipes", "POST", payload);
      }
      router.push("/recipes");
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Could not save.");
      setBusy(false);
    }
  }

  async function remove() {
    if (!initial?.id) return;
    if (!window.confirm("Delete this recipe?")) return;
    setBusy(true);
    try {
      await apiJson(`/api/v1/recipes/${initial.id}`, "DELETE");
      router.push("/recipes");
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Could not delete.");
      setBusy(false);
    }
  }

  return (
    <div className="surface flex max-w-2xl flex-col gap-5 rounded-2xl p-6">
      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <label className="flex flex-col gap-1 text-sm">
        Name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Margherita pizza"
          className="rounded-md border bg-background px-3 py-2"
        />
      </label>

      <label className="flex max-w-40 flex-col gap-1 text-sm">
        Menu price ($)
        <input
          value={menuPrice}
          onChange={(e) => setMenuPrice(e.target.value)}
          inputMode="decimal"
          placeholder="16.00"
          className="tabular rounded-md border bg-background px-3 py-2"
        />
      </label>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Ingredients</p>
        {rows.map((row, index) => (
          <div key={index} className="flex items-center gap-2">
            <select
              value={row.productId}
              onChange={(e) => setRow(index, { productId: e.target.value })}
              className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="">Pick a product…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.costCents != null ? ` — ${formatCents(p.costCents)}` : ""}
                </option>
              ))}
            </select>
            <input
              value={row.quantity}
              onChange={(e) => setRow(index, { quantity: e.target.value })}
              inputMode="decimal"
              className="tabular w-24 rounded-md border bg-background px-3 py-2 text-sm"
              aria-label="Quantity"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
              disabled={rows.length === 1}
            >
              ✕
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => setRows((prev) => [...prev, { productId: "", quantity: "1" }])}
        >
          Add ingredient
        </Button>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-4">
        <p className="text-sm text-muted-foreground">
          Plate cost{" "}
          <span className="tabular font-medium text-foreground">
            {formatCents(previewCents)}
          </span>
        </p>
        <div className="flex gap-2">
          {initial?.id && (
            <Button type="button" variant="destructive" onClick={remove} disabled={busy}>
              Delete
            </Button>
          )}
          <Button type="button" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save recipe"}
          </Button>
        </div>
      </div>
    </div>
  );
}
