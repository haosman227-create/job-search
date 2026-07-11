/**
 * Normalization rules that back product/vendor identity. Deterministic and
 * intentionally conservative: they fold case, punctuation, diacritics, and
 * whitespace — they do not try to understand abbreviations.
 */

function foldText(input: string): string {
  return input
    .normalize("NFKD")
    // Strip combining diacritical marks left over from NFKD.
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    // Apostrophes bind letters ("lay's" → "lays"), they don't separate words.
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Identity key for barcode-less products: vendor + this (SPEC §6). */
export function normalizeProductName(name: string): string {
  return foldText(name);
}

const VENDOR_LEGAL_SUFFIXES = new Set([
  "inc",
  "incorporated",
  "llc",
  "ltd",
  "limited",
  "corp",
  "corporation",
  "co",
  "company",
]);

/** Dedup key for vendors (SPEC §6): folded name minus legal suffixes. */
export function normalizeVendorName(name: string): string {
  const words = foldText(name).split(" ");
  while (
    words.length > 1 &&
    VENDOR_LEGAL_SUFFIXES.has(words[words.length - 1])
  ) {
    words.pop();
  }
  return words.join(" ");
}

/**
 * Canonical barcode: digits only, leading zeros dropped so UPC-A and its
 * zero-padded EAN-13 form match as the same product. Null when nothing
 * scannable remains.
 */
export function normalizeBarcode(barcode: string | null | undefined): string | null {
  if (!barcode) return null;
  const digits = barcode.replace(/\D/g, "").replace(/^0+/, "");
  return digits.length >= 4 ? digits : null;
}

/**
 * Canonical invoice number for duplicate detection (SPEC §7.1): case and
 * separator differences ("INV-001" vs "inv 001") must not defeat the check.
 */
export function normalizeInvoiceNumber(
  invoiceNumber: string | null | undefined,
): string | null {
  if (!invoiceNumber) return null;
  const folded = invoiceNumber.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return folded.length > 0 ? folded : null;
}
