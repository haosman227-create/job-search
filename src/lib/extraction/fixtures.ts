import type { ExtractedInvoice, ExtractionResult } from "./schema";

/** Test fixtures shared by the schema, job, and (later) review-screen tests. */

const fullConfidence = {
  barcode: 0.95,
  name: 0.98,
  quantity: 0.99,
  unit_cost_cents: 0.97,
  line_total_cents: 0.97,
};

export function cleanInvoice(
  overrides: Partial<ExtractedInvoice> = {},
): ExtractedInvoice {
  return {
    vendor_name: "Acme Foods Inc.",
    invoice_number: "INV-1001",
    invoice_date: "2026-07-01",
    total_cents: 4297,
    confidence: {
      vendor_name: 0.99,
      invoice_number: 0.98,
      invoice_date: 0.97,
      total_cents: 0.99,
    },
    overall_confidence: 0.97,
    lines: [
      {
        raw_text: "012345678905 Cola 330ml 24 x 0.75 18.00",
        barcode: "012345678905",
        name: "Cola 330ml",
        quantity: 24,
        unit_cost_cents: 75,
        line_total_cents: 1800,
        illegible: false,
        confidence: fullConfidence,
      },
      {
        raw_text: "Lay's Classic 50g 13 x 1.23 15.99",
        barcode: null,
        name: "Lay's Classic 50g",
        quantity: 13,
        unit_cost_cents: 123,
        line_total_cents: 1599,
        illegible: false,
        confidence: fullConfidence,
      },
      {
        raw_text: "Gum spearmint 14 x 0.32 4.48",
        barcode: null,
        name: "Gum spearmint",
        quantity: 14,
        unit_cost_cents: 32,
        line_total_cents: 448,
        illegible: false,
        confidence: fullConfidence,
      },
    ],
    ...overrides,
  };
}

export function partialInvoice(): ExtractedInvoice {
  const invoice = cleanInvoice();
  invoice.lines.push({
    raw_text: "smudged: ~um?? 1? x ?.??",
    barcode: null,
    name: null,
    quantity: null,
    unit_cost_cents: null,
    line_total_cents: null,
    illegible: true,
    confidence: {
      barcode: 0,
      name: 0.1,
      quantity: 0.05,
      unit_cost_cents: 0,
      line_total_cents: 0,
    },
  });
  return invoice;
}

export function multiInvoiceResult(): ExtractionResult {
  return {
    invoices: [
      cleanInvoice(),
      cleanInvoice({
        vendor_name: "Best Supply LLC",
        invoice_number: "BS-77",
        total_cents: 1800,
      }),
    ],
  };
}
