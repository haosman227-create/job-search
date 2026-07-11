import { z } from "zod";

/**
 * Shape of what Claude extracts from an invoice file (SPEC §3 step 2).
 * Shared by the extraction client (validates model output) and the review UI
 * (renders per-field confidence). Money is integer cents; confidences 0..1.
 */

export const confidenceSchema = z.number().min(0).max(1);

export const extractedLineSchema = z.object({
  raw_text: z
    .string()
    .nullable()
    .describe("The line exactly as printed on the invoice"),
  barcode: z.string().nullable(),
  name: z.string().nullable(),
  quantity: z.number().min(0).nullable(),
  unit_cost_cents: z.int().min(0).nullable(),
  line_total_cents: z.int().min(0).nullable(),
  illegible: z
    .boolean()
    .describe("True when the line is present but cannot be read reliably"),
  confidence: z.object({
    barcode: confidenceSchema,
    name: confidenceSchema,
    quantity: confidenceSchema,
    unit_cost_cents: confidenceSchema,
    line_total_cents: confidenceSchema,
  }),
});

export const extractedInvoiceSchema = z.object({
  vendor_name: z.string().nullable(),
  invoice_number: z.string().nullable(),
  invoice_date: z
    .string()
    .nullable()
    .describe("ISO date YYYY-MM-DD, or null if unreadable"),
  total_cents: z.int().min(0).nullable(),
  confidence: z.object({
    vendor_name: confidenceSchema,
    invoice_number: confidenceSchema,
    invoice_date: confidenceSchema,
    total_cents: confidenceSchema,
  }),
  overall_confidence: confidenceSchema,
  lines: z.array(extractedLineSchema),
});

export const extractionResultSchema = z.object({
  // One entry per distinct invoice found in the file(s); multi-page PDFs of a
  // single invoice produce exactly one entry (SPEC §7.3).
  invoices: z.array(extractedInvoiceSchema).min(1),
});

export type ExtractedLine = z.infer<typeof extractedLineSchema>;
export type ExtractedInvoice = z.infer<typeof extractedInvoiceSchema>;
export type ExtractionResult = z.infer<typeof extractionResultSchema>;

/** A stored invoice file, downloaded and ready to send to the model. */
export interface ExtractionFile {
  mediaType: string;
  base64: string;
}
