import {
  normalizeBarcode,
  normalizeInvoiceNumber,
  normalizeProductName,
} from "./normalize";

/**
 * Product identity (SPEC §6): barcode when present, otherwise
 * vendor + normalized product name. Matches the partial unique indexes
 * in the schema migration.
 */
export type ProductIdentity =
  | { kind: "barcode"; barcode: string }
  | { kind: "vendor-name"; vendorId: string; normalizedName: string };

export function resolveProductIdentity(line: {
  barcode: string | null | undefined;
  vendorId: string;
  name: string;
}): ProductIdentity {
  const barcode = normalizeBarcode(line.barcode);
  if (barcode) {
    return { kind: "barcode", barcode };
  }
  return {
    kind: "vendor-name",
    vendorId: line.vendorId,
    normalizedName: normalizeProductName(line.name),
  };
}

export function sameIdentity(a: ProductIdentity, b: ProductIdentity): boolean {
  if (a.kind === "barcode" && b.kind === "barcode") {
    return a.barcode === b.barcode;
  }
  if (a.kind === "vendor-name" && b.kind === "vendor-name") {
    return a.vendorId === b.vendorId && a.normalizedName === b.normalizedName;
  }
  return false;
}

export interface InvoiceKey {
  vendorId: string | null;
  invoiceNumber: string | null;
  totalCents: number | null;
}

/**
 * Duplicate-invoice predicate (SPEC §7.1): same vendor + invoice number +
 * total. All three must be known on both sides — a missing field means we
 * can't call it a duplicate, so the import proceeds without the warning.
 */
export function isDuplicateInvoice(
  candidate: InvoiceKey,
  existing: InvoiceKey,
): boolean {
  const candidateNumber = normalizeInvoiceNumber(candidate.invoiceNumber);
  const existingNumber = normalizeInvoiceNumber(existing.invoiceNumber);
  return (
    candidate.vendorId != null &&
    candidate.vendorId === existing.vendorId &&
    candidateNumber != null &&
    candidateNumber === existingNumber &&
    candidate.totalCents != null &&
    candidate.totalCents === existing.totalCents
  );
}
