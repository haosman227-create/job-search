import { normalizeVendorName } from "@/lib/domain";
import type {
  ExtractedInvoice,
  ExtractionFile,
  ExtractionResult,
} from "./schema";

/**
 * The extraction background job (SPEC §3 step 2, §8): runs after upload,
 * drives the invoice from `processing` to `needs_review` / `partial` /
 * `failed`. The client polls invoice status; no queue service in v1.
 *
 * All I/O is injected so the whole flow is testable without Supabase or the
 * Claude API.
 */

export interface InvoiceRecord {
  id: string;
  business_id: string;
  status: string;
  file_paths: string[];
  uploaded_by: string | null;
}

export interface ExtractedInvoiceUpdate {
  vendor_id: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  total_cents: number | null;
  status: "needs_review" | "partial";
  extraction_model: string;
  extraction_confidence: number;
}

export interface LineInsert {
  business_id: string;
  invoice_id: string;
  raw_text: string | null;
  barcode: string | null;
  name: string | null;
  quantity: number | null;
  unit_cost_cents: number | null;
  line_total_cents: number | null;
  confidence: Record<string, number>;
  illegible: boolean;
}

export interface ExtractionJobDeps {
  loadInvoice(invoiceId: string): Promise<InvoiceRecord | null>;
  downloadFile(path: string): Promise<ExtractionFile>;
  extract(files: ExtractionFile[]): Promise<ExtractionResult>;
  /** Find-or-create by normalized name within the business; returns vendor id. */
  upsertVendor(
    businessId: string,
    name: string,
    normalizedName: string,
  ): Promise<string>;
  updateInvoice(invoiceId: string, fields: ExtractedInvoiceUpdate): Promise<void>;
  /** For multi-invoice files (SPEC §7.3): a sibling row sharing the files. */
  createInvoice(fields: {
    business_id: string;
    file_paths: string[];
    uploaded_by: string | null;
  }): Promise<string>;
  insertLines(lines: LineInsert[]): Promise<void>;
  markFailed(invoiceId: string): Promise<void>;
}

export interface ExtractionJobResult {
  ok: boolean;
  invoiceIds: string[];
  skipped?: boolean;
}

export async function runExtractionJob(
  deps: ExtractionJobDeps,
  invoiceId: string,
  extractionModel: string,
): Promise<ExtractionJobResult> {
  const invoice = await deps.loadInvoice(invoiceId);
  // Only ever process a `processing` invoice: re-triggering (double-poll,
  // retry after a crash mid-write) must not duplicate lines.
  if (!invoice || invoice.status !== "processing") {
    return { ok: false, invoiceIds: [], skipped: true };
  }

  try {
    if (invoice.file_paths.length === 0) {
      throw new Error("Invoice has no files to extract");
    }
    const files = await Promise.all(
      invoice.file_paths.map((path) => deps.downloadFile(path)),
    );
    const result = await deps.extract(files);

    const invoiceIds: string[] = [];
    for (const [index, extracted] of result.invoices.entries()) {
      const targetId =
        index === 0
          ? invoice.id
          : await deps.createInvoice({
              business_id: invoice.business_id,
              file_paths: invoice.file_paths,
              uploaded_by: invoice.uploaded_by,
            });

      await writeExtractedInvoice(
        deps,
        invoice.business_id,
        targetId,
        extracted,
        extractionModel,
      );
      invoiceIds.push(targetId);
    }
    return { ok: true, invoiceIds };
  } catch {
    await deps.markFailed(invoice.id).catch(() => {});
    return { ok: false, invoiceIds: [] };
  }
}

async function writeExtractedInvoice(
  deps: ExtractionJobDeps,
  businessId: string,
  invoiceId: string,
  extracted: ExtractedInvoice,
  extractionModel: string,
): Promise<void> {
  let vendorId: string | null = null;
  if (extracted.vendor_name) {
    vendorId = await deps.upsertVendor(
      businessId,
      extracted.vendor_name,
      normalizeVendorName(extracted.vendor_name),
    );
  }

  await deps.insertLines(
    extracted.lines.map((line) => ({
      business_id: businessId,
      invoice_id: invoiceId,
      raw_text: line.raw_text,
      barcode: line.barcode,
      name: line.name,
      quantity: line.quantity,
      unit_cost_cents: line.unit_cost_cents,
      line_total_cents: line.line_total_cents,
      confidence: line.confidence,
      illegible: line.illegible,
    })),
  );

  await deps.updateInvoice(invoiceId, {
    vendor_id: vendorId,
    invoice_number: extracted.invoice_number,
    invoice_date: extracted.invoice_date,
    total_cents: extracted.total_cents,
    // Readable lines still flow to review; illegible ones keep it partial
    // until resolved (SPEC §7.4).
    status: extracted.lines.some((l) => l.illegible) ? "partial" : "needs_review",
    extraction_model: extractionModel,
    extraction_confidence: extracted.overall_confidence,
  });
}
