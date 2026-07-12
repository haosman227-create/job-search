import { z } from "zod";

/**
 * What the review screen submits on Confirm (SPEC §3 step 3). Carries the
 * user-corrected values; extraction confidences ride along so the stored
 * lines keep their provenance. Shared with the Phase 7 UI.
 */

export const confirmLineSchema = z.object({
  /** Existing invoice_line id, or null for a manually added line. */
  id: z.uuid().nullable(),
  raw_text: z.string().nullable(),
  barcode: z.string().nullable(),
  name: z.string().trim().nullable(),
  quantity: z.number().min(0).nullable(),
  unit_cost_cents: z.int().min(0).nullable(),
  line_total_cents: z.int().min(0).nullable(),
  confidence: z.record(z.string(), z.number().min(0).max(1)).default({}),
  /** Still unreadable after review — kept as a flagged placeholder row. */
  illegible: z.boolean().default(false),
});

export const confirmInvoiceSchema = z.object({
  invoiceId: z.uuid(),
  vendor_name: z.string().trim().min(1, "Vendor is required"),
  invoice_number: z.string().trim().nullable(),
  invoice_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .nullable(),
  total_cents: z.int().min(0).nullable(),
  /** Explicit user acknowledgement of the duplicate warning (SPEC §7.1). */
  overrideDuplicate: z.boolean().default(false),
  lines: z.array(confirmLineSchema).min(1, "At least one line is required"),
});

export type ConfirmLine = z.infer<typeof confirmLineSchema>;
export type ConfirmInvoicePayload = z.infer<typeof confirmInvoiceSchema>;

/** A line becomes a catalog entry only when it has a name and a cost. */
export function isMergeableLine(line: ConfirmLine): boolean {
  return (
    !line.illegible &&
    !!line.name &&
    line.name.trim().length > 0 &&
    line.unit_cost_cents != null
  );
}
