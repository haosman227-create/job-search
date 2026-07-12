"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { isLowConfidence } from "@/lib/catalog/confidence";
import {
  centsToInput,
  inputToCents,
  inputToQuantity,
} from "@/lib/catalog/money-input";
import type { ConfirmResult } from "@/lib/catalog/confirm";
import type { ConfirmInvoicePayload } from "@/lib/catalog/confirm-schema";
import type { InvoiceLineRow } from "@/lib/types";

interface EditableLine {
  id: string | null;
  raw_text: string | null;
  barcode: string;
  name: string;
  quantity: string;
  unit_cost: string;
  line_total: string;
  confidence: Record<string, number>;
  illegible: boolean;
}

function toEditable(line: InvoiceLineRow): EditableLine {
  return {
    id: line.id,
    raw_text: line.raw_text,
    barcode: line.barcode ?? "",
    name: line.name ?? "",
    quantity: line.quantity != null ? String(line.quantity) : "",
    unit_cost: centsToInput(line.unit_cost_cents),
    line_total: centsToInput(line.line_total_cents),
    confidence: line.confidence ?? {},
    illegible: line.illegible,
  };
}

function blankLine(): EditableLine {
  return {
    id: null,
    raw_text: null,
    barcode: "",
    name: "",
    quantity: "",
    unit_cost: "",
    line_total: "",
    confidence: {},
    illegible: false,
  };
}

const cellInput =
  "w-full rounded border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring";
const lowConfidence = "border-amber-500 bg-amber-50 dark:bg-amber-950/40";

export function ReviewForm({
  invoiceId,
  header,
  lines,
  confirmAction,
}: {
  invoiceId: string;
  header: {
    vendor_name: string;
    invoice_number: string;
    invoice_date: string;
    total_cents: number | null;
    confidence: Record<string, number>;
  };
  lines: InvoiceLineRow[];
  confirmAction: (payload: ConfirmInvoicePayload) => Promise<ConfirmResult>;
}) {
  const router = useRouter();
  const [vendorName, setVendorName] = useState(header.vendor_name);
  const [invoiceNumber, setInvoiceNumber] = useState(header.invoice_number);
  const [invoiceDate, setInvoiceDate] = useState(header.invoice_date);
  const [total, setTotal] = useState(centsToInput(header.total_cents));
  const [rows, setRows] = useState<EditableLine[]>(lines.map(toEditable));
  const [error, setError] = useState<string | null>(null);
  const [duplicateInvoiceId, setDuplicateInvoiceId] = useState<string | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();

  function updateRow(index: number, patch: Partial<EditableLine>) {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  function buildPayload(overrideDuplicate: boolean): ConfirmInvoicePayload {
    return {
      invoiceId,
      vendor_name: vendorName.trim(),
      invoice_number: invoiceNumber.trim() || null,
      invoice_date: invoiceDate.trim() || null,
      total_cents: inputToCents(total),
      overrideDuplicate,
      lines: rows.map((row) => ({
        id: row.id,
        raw_text: row.raw_text,
        barcode: row.barcode.trim() || null,
        name: row.name.trim() || null,
        quantity: inputToQuantity(row.quantity),
        unit_cost_cents: inputToCents(row.unit_cost),
        line_total_cents: inputToCents(row.line_total),
        confidence: row.confidence,
        illegible: row.illegible,
      })),
    };
  }

  function submit(overrideDuplicate: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await confirmAction(buildPayload(overrideDuplicate));
      if (result.outcome === "confirmed") {
        router.refresh();
        return;
      }
      if (result.outcome === "duplicate") {
        setDuplicateInvoiceId(result.existingInvoiceId);
        return;
      }
      setError(result.message);
    });
  }

  const hasIllegible = rows.some((r) => r.illegible);

  return (
    <div className="flex flex-col gap-4">
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Vendor" low={isLowConfidence(header.confidence.vendor_name)}>
          <input
            className={cn(
              cellInput,
              isLowConfidence(header.confidence.vendor_name) && lowConfidence,
            )}
            value={vendorName}
            onChange={(e) => setVendorName(e.target.value)}
            aria-label="Vendor"
          />
        </Field>
        <Field label="Invoice #" low={isLowConfidence(header.confidence.invoice_number)}>
          <input
            className={cn(
              cellInput,
              isLowConfidence(header.confidence.invoice_number) && lowConfidence,
            )}
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            aria-label="Invoice number"
          />
        </Field>
        <Field label="Date" low={isLowConfidence(header.confidence.invoice_date)}>
          <input
            className={cn(
              cellInput,
              isLowConfidence(header.confidence.invoice_date) && lowConfidence,
            )}
            value={invoiceDate}
            placeholder="YYYY-MM-DD"
            onChange={(e) => setInvoiceDate(e.target.value)}
            aria-label="Invoice date"
          />
        </Field>
        <Field label="Total" low={isLowConfidence(header.confidence.total_cents)}>
          <input
            className={cn(
              cellInput,
              "text-right tabular-nums",
              isLowConfidence(header.confidence.total_cents) && lowConfidence,
            )}
            value={total}
            inputMode="decimal"
            onChange={(e) => setTotal(e.target.value)}
            aria-label="Invoice total"
          />
        </Field>
      </section>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="p-2 font-medium">Barcode</th>
              <th className="p-2 font-medium">Product</th>
              <th className="p-2 text-right font-medium">Qty</th>
              <th className="p-2 text-right font-medium">Unit cost</th>
              <th className="p-2 text-right font-medium">Line total</th>
              <th className="p-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={row.id ?? `new-${index}`}
                className={cn("border-b", row.illegible && "bg-muted/40")}
              >
                <td className="p-1 align-top">
                  <input
                    className={cn(
                      cellInput,
                      isLowConfidence(row.confidence.barcode) && lowConfidence,
                    )}
                    value={row.barcode}
                    onChange={(e) => updateRow(index, { barcode: e.target.value })}
                    aria-label={`Barcode row ${index + 1}`}
                  />
                </td>
                <td className="p-1 align-top">
                  <input
                    className={cn(
                      cellInput,
                      isLowConfidence(row.confidence.name) && lowConfidence,
                    )}
                    value={row.name}
                    placeholder={row.illegible ? "Enter product name…" : ""}
                    onChange={(e) => updateRow(index, { name: e.target.value })}
                    aria-label={`Product name row ${index + 1}`}
                  />
                  {row.raw_text ? (
                    <p className="mt-1 truncate text-xs text-muted-foreground" title={row.raw_text}>
                      {row.raw_text}
                    </p>
                  ) : null}
                </td>
                <td className="p-1 align-top">
                  <input
                    className={cn(
                      cellInput,
                      "text-right tabular-nums",
                      isLowConfidence(row.confidence.quantity) && lowConfidence,
                    )}
                    value={row.quantity}
                    inputMode="decimal"
                    onChange={(e) => updateRow(index, { quantity: e.target.value })}
                    aria-label={`Quantity row ${index + 1}`}
                  />
                </td>
                <td className="p-1 align-top">
                  <input
                    className={cn(
                      cellInput,
                      "text-right tabular-nums",
                      isLowConfidence(row.confidence.unit_cost_cents) && lowConfidence,
                    )}
                    value={row.unit_cost}
                    inputMode="decimal"
                    onChange={(e) => updateRow(index, { unit_cost: e.target.value })}
                    aria-label={`Unit cost row ${index + 1}`}
                  />
                </td>
                <td className="p-1 align-top">
                  <input
                    className={cn(
                      cellInput,
                      "text-right tabular-nums",
                      isLowConfidence(row.confidence.line_total_cents) && lowConfidence,
                    )}
                    value={row.line_total}
                    inputMode="decimal"
                    onChange={(e) => updateRow(index, { line_total: e.target.value })}
                    aria-label={`Line total row ${index + 1}`}
                  />
                </td>
                <td className="p-1 align-top">
                  <div className="flex flex-col items-end gap-1">
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline"
                      onClick={() =>
                        updateRow(index, { illegible: !row.illegible })
                      }
                    >
                      {row.illegible ? "unflag" : "flag"}
                    </button>
                    <button
                      type="button"
                      className="text-xs text-destructive underline"
                      onClick={() =>
                        setRows((prev) => prev.filter((_, i) => i !== index))
                      }
                    >
                      remove
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setRows((prev) => [...prev, blankLine()])}
        >
          Add line
        </Button>
      </div>

      {hasIllegible ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          This invoice has flagged lines. Readable lines still merge into the
          catalog on confirm; the invoice stays marked <strong>partial</strong>{" "}
          until every line is resolved.
        </p>
      ) : null}

      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {duplicateInvoiceId ? (
        <div className="flex flex-col gap-2 rounded-md border border-amber-500 bg-amber-50 px-3 py-3 text-sm dark:bg-amber-950/40">
          <p className="text-amber-900 dark:text-amber-200">
            An invoice with the same vendor, number, and total already exists.
            Import this one anyway?
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={isPending}
              onClick={() => submit(true)}
            >
              Import anyway
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setDuplicateInvoiceId(null)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button type="button" disabled={isPending} onClick={() => submit(false)}>
            {isPending ? "Confirming…" : "Confirm"}
          </Button>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  low,
  children,
}: {
  label: string;
  low: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground">
        {label}
        {low ? <span className="ml-1 text-amber-600">• check</span> : null}
      </span>
      {children}
    </label>
  );
}
