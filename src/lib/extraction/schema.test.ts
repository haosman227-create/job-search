import { describe, expect, it } from "vitest";
import { extractionResultSchema } from "./schema";
import { cleanInvoice, multiInvoiceResult, partialInvoice } from "./fixtures";

describe("extractionResultSchema", () => {
  it("accepts clean, partial, and multi-invoice fixtures", () => {
    for (const result of [
      { invoices: [cleanInvoice()] },
      { invoices: [partialInvoice()] },
      multiInvoiceResult(),
    ]) {
      expect(extractionResultSchema.parse(result)).toBeTruthy();
    }
  });

  it("rejects fractional cents", () => {
    const invoice = cleanInvoice();
    invoice.lines[0].unit_cost_cents = 12.34;
    expect(extractionResultSchema.safeParse({ invoices: [invoice] }).success).toBe(
      false,
    );
  });

  it("rejects out-of-range confidence", () => {
    const invoice = cleanInvoice();
    invoice.confidence.total_cents = 1.2;
    expect(extractionResultSchema.safeParse({ invoices: [invoice] }).success).toBe(
      false,
    );
  });

  it("rejects an empty invoices array and missing fields", () => {
    expect(extractionResultSchema.safeParse({ invoices: [] }).success).toBe(false);
    const invoice = cleanInvoice() as Record<string, unknown>;
    delete invoice.overall_confidence;
    expect(extractionResultSchema.safeParse({ invoices: [invoice] }).success).toBe(
      false,
    );
  });

  it("rejects negative money", () => {
    const invoice = cleanInvoice();
    invoice.total_cents = -1;
    expect(extractionResultSchema.safeParse({ invoices: [invoice] }).success).toBe(
      false,
    );
  });
});
