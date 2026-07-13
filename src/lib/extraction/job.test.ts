import { describe, expect, it, vi } from "vitest";
import { runExtractionJob, type ExtractionJobDeps } from "./job";
import { cleanInvoice, multiInvoiceResult, partialInvoice } from "./fixtures";
import type { ExtractionResult } from "./schema";

const BIZ = "b1111111-1111-1111-1111-111111111111";
const INVOICE = "inv-original";
const MODEL = "claude-sonnet-5";

function stubDeps(
  result: ExtractionResult | Error,
  overrides: Partial<ExtractionJobDeps> = {},
): ExtractionJobDeps {
  return {
    loadInvoice: vi.fn(async (id: string) => ({
      id,
      business_id: BIZ,
      status: "processing",
      file_paths: ["path/a.jpg"],
      uploaded_by: "user-1",
    })),
    downloadFile: vi.fn(async () => ({ mediaType: "image/jpeg", base64: "aa" })),
    extract: vi.fn(async () => {
      if (result instanceof Error) throw result;
      return result;
    }),
    upsertVendor: vi.fn(async () => "vendor-1"),
    updateInvoice: vi.fn(async () => {}),
    createInvoice: vi.fn(async () => "inv-sibling"),
    insertLines: vi.fn(async () => {}),
    markFailed: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("runExtractionJob", () => {
  it("writes lines and moves a clean invoice to needs_review", async () => {
    const deps = stubDeps({ invoices: [cleanInvoice()] });
    const result = await runExtractionJob(deps, INVOICE, MODEL);

    expect(result).toEqual({ ok: true, invoiceIds: [INVOICE] });
    expect(deps.upsertVendor).toHaveBeenCalledWith(
      BIZ,
      "Acme Foods Inc.",
      "acme foods",
    );
    const lines = vi.mocked(deps.insertLines).mock.calls[0][0];
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({
      business_id: BIZ,
      invoice_id: INVOICE,
      barcode: "012345678905",
      unit_cost_cents: 75,
      illegible: false,
    });
    expect(deps.updateInvoice).toHaveBeenCalledWith(
      INVOICE,
      expect.objectContaining({
        vendor_id: "vendor-1",
        invoice_number: "INV-1001",
        total_cents: 4297,
        status: "needs_review",
        extraction_model: MODEL,
        extraction_confidence: 0.97,
        // Per-field header confidence persisted for the review screen.
        header_confidence: {
          vendor_name: 0.99,
          invoice_number: 0.98,
          invoice_date: 0.97,
          total_cents: 0.99,
        },
      }),
    );
  });

  it("marks invoices with illegible lines as partial", async () => {
    const deps = stubDeps({ invoices: [partialInvoice()] });
    await runExtractionJob(deps, INVOICE, MODEL);

    const lines = vi.mocked(deps.insertLines).mock.calls[0][0];
    expect(lines).toHaveLength(4);
    expect(lines[3]).toMatchObject({ illegible: true, name: null });
    expect(deps.updateInvoice).toHaveBeenCalledWith(
      INVOICE,
      expect.objectContaining({ status: "partial" }),
    );
  });

  it("splits multi-invoice files into sibling invoice rows", async () => {
    const deps = stubDeps(multiInvoiceResult());
    const result = await runExtractionJob(deps, INVOICE, MODEL);

    expect(result.invoiceIds).toEqual([INVOICE, "inv-sibling"]);
    expect(deps.createInvoice).toHaveBeenCalledExactlyOnceWith({
      business_id: BIZ,
      file_paths: ["path/a.jpg"],
      uploaded_by: "user-1",
    });
    // Second invoice's vendor and lines land on the sibling row.
    expect(deps.upsertVendor).toHaveBeenCalledWith(BIZ, "Best Supply LLC", "best supply");
    const secondLines = vi.mocked(deps.insertLines).mock.calls[1][0];
    expect(secondLines.every((l) => l.invoice_id === "inv-sibling")).toBe(true);
  });

  it("marks the invoice failed when extraction throws", async () => {
    const deps = stubDeps(new Error("model exploded"));
    const result = await runExtractionJob(deps, INVOICE, MODEL);

    expect(result.ok).toBe(false);
    expect(deps.markFailed).toHaveBeenCalledWith(INVOICE);
    expect(deps.insertLines).not.toHaveBeenCalled();
  });

  it("fails an invoice that has no files", async () => {
    const deps = stubDeps({ invoices: [cleanInvoice()] }, {
      loadInvoice: vi.fn(async (id: string) => ({
        id,
        business_id: BIZ,
        status: "processing",
        file_paths: [],
        uploaded_by: null,
      })),
    });
    const result = await runExtractionJob(deps, INVOICE, MODEL);
    expect(result.ok).toBe(false);
    expect(deps.markFailed).toHaveBeenCalled();
  });

  it("skips invoices that are not in processing (idempotency)", async () => {
    const deps = stubDeps({ invoices: [cleanInvoice()] }, {
      loadInvoice: vi.fn(async (id: string) => ({
        id,
        business_id: BIZ,
        status: "needs_review",
        file_paths: ["path/a.jpg"],
        uploaded_by: null,
      })),
    });
    const result = await runExtractionJob(deps, INVOICE, MODEL);
    expect(result.skipped).toBe(true);
    expect(deps.extract).not.toHaveBeenCalled();
    expect(deps.markFailed).not.toHaveBeenCalled();
  });
});
