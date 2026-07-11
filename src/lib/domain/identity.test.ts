import { describe, expect, it } from "vitest";
import {
  isDuplicateInvoice,
  resolveProductIdentity,
  sameIdentity,
} from "./identity";

const VENDOR = "11111111-1111-1111-1111-111111111111";
const OTHER_VENDOR = "22222222-2222-2222-2222-222222222222";

describe("resolveProductIdentity", () => {
  it("uses the barcode when scannable", () => {
    expect(
      resolveProductIdentity({ barcode: "012345678905", vendorId: VENDOR, name: "Cola" }),
    ).toEqual({ kind: "barcode", barcode: "12345678905" });
  });

  it("falls back to vendor + normalized name otherwise", () => {
    for (const barcode of [null, "", "N/A"]) {
      expect(
        resolveProductIdentity({ barcode, vendorId: VENDOR, name: "Lay's Classic" }),
      ).toEqual({
        kind: "vendor-name",
        vendorId: VENDOR,
        normalizedName: "lays classic",
      });
    }
  });
});

describe("sameIdentity", () => {
  it("matches barcodes across formatting differences", () => {
    const a = resolveProductIdentity({ barcode: "012345678905", vendorId: VENDOR, name: "Cola" });
    const b = resolveProductIdentity({ barcode: "12345678905", vendorId: OTHER_VENDOR, name: "COLA 330" });
    expect(sameIdentity(a, b)).toBe(true);
  });

  it("scopes name identity to the vendor", () => {
    const a = resolveProductIdentity({ barcode: null, vendorId: VENDOR, name: "Cola" });
    const b = resolveProductIdentity({ barcode: null, vendorId: OTHER_VENDOR, name: "Cola" });
    expect(sameIdentity(a, b)).toBe(false);
  });

  it("never equates a barcode identity with a name identity", () => {
    const a = resolveProductIdentity({ barcode: "12345678905", vendorId: VENDOR, name: "Cola" });
    const b = resolveProductIdentity({ barcode: null, vendorId: VENDOR, name: "Cola" });
    expect(sameIdentity(a, b)).toBe(false);
  });
});

describe("isDuplicateInvoice", () => {
  const existing = {
    vendorId: VENDOR,
    invoiceNumber: "INV-001",
    totalCents: 12345,
  };

  it("flags the same vendor + number + total, however formatted", () => {
    expect(
      isDuplicateInvoice(
        { vendorId: VENDOR, invoiceNumber: "inv 001", totalCents: 12345 },
        existing,
      ),
    ).toBe(true);
  });

  it("requires all three fields to differ-proof the match", () => {
    expect(
      isDuplicateInvoice(
        { vendorId: OTHER_VENDOR, invoiceNumber: "INV-001", totalCents: 12345 },
        existing,
      ),
    ).toBe(false);
    expect(
      isDuplicateInvoice(
        { vendorId: VENDOR, invoiceNumber: "INV-002", totalCents: 12345 },
        existing,
      ),
    ).toBe(false);
    expect(
      isDuplicateInvoice(
        { vendorId: VENDOR, invoiceNumber: "INV-001", totalCents: 99 },
        existing,
      ),
    ).toBe(false);
  });

  it("treats missing fields as not-a-duplicate rather than guessing", () => {
    expect(
      isDuplicateInvoice(
        { vendorId: VENDOR, invoiceNumber: null, totalCents: 12345 },
        existing,
      ),
    ).toBe(false);
    expect(
      isDuplicateInvoice(
        { vendorId: null, invoiceNumber: "INV-001", totalCents: 12345 },
        existing,
      ),
    ).toBe(false);
    expect(
      isDuplicateInvoice(
        { vendorId: VENDOR, invoiceNumber: "INV-001", totalCents: null },
        existing,
      ),
    ).toBe(false);
  });
});
