import { describe, expect, it } from "vitest";
import {
  normalizeBarcode,
  normalizeInvoiceNumber,
  normalizeProductName,
  normalizeVendorName,
} from "./normalize";

describe("normalizeProductName", () => {
  const same: Array<[string, string]> = [
    ["Coca-Cola 330ml", "coca cola 330ML"],
    ["  Lay's   Classic  ", "lays classic"],
    ["Café Bustelo", "cafe bustelo"],
    ["CHIPS (BBQ) 50g", "chips bbq 50 g".replace("50 g", "50g")],
    ["Red Bull 8.4oz", "red bull 8 4oz"],
  ];

  it.each(same)("treats %j and %j as the same product name", (a, b) => {
    expect(normalizeProductName(a)).toBe(normalizeProductName(b));
  });

  const different: Array<[string, string]> = [
    ["Cola 330ml", "Cola 500ml"],
    ["Chips BBQ", "Chips Salted"],
  ];

  it.each(different)("keeps %j and %j distinct", (a, b) => {
    expect(normalizeProductName(a)).not.toBe(normalizeProductName(b));
  });
});

describe("normalizeVendorName", () => {
  it("drops legal suffixes and punctuation", () => {
    expect(normalizeVendorName("Acme Foods, Inc.")).toBe("acme foods");
    expect(normalizeVendorName("ACME FOODS LLC")).toBe("acme foods");
    expect(normalizeVendorName("Acme Foods Co.")).toBe("acme foods");
    expect(normalizeVendorName("Acme Foods Company Ltd")).toBe("acme foods");
  });

  it("never erases the whole name", () => {
    expect(normalizeVendorName("Inc")).toBe("inc");
    expect(normalizeVendorName("Co. Inc.")).toBe("co");
  });

  it("keeps genuinely different vendors apart", () => {
    expect(normalizeVendorName("Acme Foods")).not.toBe(
      normalizeVendorName("Acme Beverages"),
    );
  });
});

describe("normalizeBarcode", () => {
  it("keeps digits and drops padding zeros", () => {
    expect(normalizeBarcode("012345678905")).toBe("12345678905");
    expect(normalizeBarcode("12345678905")).toBe("12345678905");
    expect(normalizeBarcode(" 4-006381-333931 ")).toBe("4006381333931");
  });

  it("returns null for unusable values", () => {
    expect(normalizeBarcode(null)).toBeNull();
    expect(normalizeBarcode("")).toBeNull();
    expect(normalizeBarcode("N/A")).toBeNull();
    expect(normalizeBarcode("000")).toBeNull();
    expect(normalizeBarcode("12")).toBeNull();
  });
});

describe("normalizeInvoiceNumber", () => {
  it("folds case and separators", () => {
    expect(normalizeInvoiceNumber("INV-001")).toBe("INV001");
    expect(normalizeInvoiceNumber("inv 001")).toBe("INV001");
    expect(normalizeInvoiceNumber("Inv#001")).toBe("INV001");
  });

  it("returns null when empty", () => {
    expect(normalizeInvoiceNumber(null)).toBeNull();
    expect(normalizeInvoiceNumber("--")).toBeNull();
  });
});
