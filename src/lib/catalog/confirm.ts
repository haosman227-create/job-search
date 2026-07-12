import {
  computeSalePrice,
  normalizeBarcode,
  normalizeInvoiceNumber,
  normalizeProductName,
  normalizeVendorName,
} from "@/lib/domain";
import {
  isMergeableLine,
  type ConfirmInvoicePayload,
  type ConfirmLine,
} from "./confirm-schema";

/**
 * The catalog merge engine (SPEC §3 step 4, PLAN Phase 6): confirmed lines
 * become products with cost history. Framework-free; all I/O is injected so
 * the same engine runs against Supabase in production and raw Postgres in
 * integration tests.
 *
 * Write order is chosen so a mid-flight crash is recoverable by simply
 * confirming again: products first, lines next, the invoice status last.
 */

export interface ProductRecord {
  id: string;
  department_id: string | null;
  current_cost_cents: number | null;
  sale_price_override_cents: number | null;
}

export interface DepartmentRecord {
  id: string;
  name: string;
  target_markup: number;
}

export interface DepartmentAssignment {
  department_id: string | null;
  confidence: number;
}

export interface NewProduct {
  business_id: string;
  vendor_id: string;
  barcode: string | null;
  name: string;
  normalized_name: string;
  department_id: string | null;
  department_confidence: number | null;
  current_cost_cents: number;
  previous_cost_cents: null;
  sale_price_cents: number | null;
}

export interface LineWrite {
  id: string | null;
  business_id: string;
  invoice_id: string;
  product_id: string | null;
  raw_text: string | null;
  barcode: string | null;
  name: string | null;
  quantity: number | null;
  unit_cost_cents: number | null;
  line_total_cents: number | null;
  confidence: Record<string, number>;
  illegible: boolean;
}

export interface ConfirmDeps {
  loadInvoice(invoiceId: string): Promise<{
    id: string;
    business_id: string;
    status: string;
  } | null>;
  upsertVendor(
    businessId: string,
    name: string,
    normalizedName: string,
  ): Promise<string>;
  /** Confirmed/partial invoices matching vendor + number + total, excluding this one. */
  findDuplicateInvoice(params: {
    businessId: string;
    vendorId: string;
    invoiceNumber: string;
    totalCents: number;
    excludeInvoiceId: string;
  }): Promise<string | null>;
  getDepartments(businessId: string): Promise<DepartmentRecord[]>;
  /** AI department assignment for products not yet in the catalog (SPEC §3 step 4). */
  assignDepartments(
    productNames: string[],
    departments: DepartmentRecord[],
  ): Promise<DepartmentAssignment[]>;
  findProductByBarcode(
    businessId: string,
    barcode: string,
  ): Promise<ProductRecord | null>;
  findProductByVendorName(
    businessId: string,
    vendorId: string,
    normalizedName: string,
  ): Promise<ProductRecord | null>;
  insertProduct(product: NewProduct): Promise<string>;
  updateProductCost(
    productId: string,
    fields: {
      previous_cost_cents: number | null;
      current_cost_cents: number;
      /** Present only when the computed price should change. */
      sale_price_cents?: number;
    },
  ): Promise<void>;
  /** Replaces the invoice's lines with the reviewed set. */
  replaceInvoiceLines(invoiceId: string, lines: LineWrite[]): Promise<void>;
  updateInvoice(
    invoiceId: string,
    fields: {
      vendor_id: string;
      invoice_number: string | null;
      invoice_date: string | null;
      total_cents: number | null;
      status: "confirmed" | "partial";
    },
  ): Promise<void>;
}

export type ConfirmResult =
  | { outcome: "confirmed"; status: "confirmed" | "partial"; productIds: string[] }
  | { outcome: "duplicate"; existingInvoiceId: string }
  | { outcome: "invalid"; message: string };

export async function confirmInvoice(
  deps: ConfirmDeps,
  payload: ConfirmInvoicePayload,
): Promise<ConfirmResult> {
  const invoice = await deps.loadInvoice(payload.invoiceId);
  if (!invoice) {
    return { outcome: "invalid", message: "Invoice not found" };
  }
  if (!["needs_review", "partial"].includes(invoice.status)) {
    return {
      outcome: "invalid",
      message: `Invoice cannot be confirmed from status "${invoice.status}"`,
    };
  }

  const businessId = invoice.business_id;
  const vendorId = await deps.upsertVendor(
    businessId,
    payload.vendor_name,
    normalizeVendorName(payload.vendor_name),
  );

  // Duplicate guard (SPEC §7.1): same vendor + invoice number + total needs
  // an explicit override before importing again.
  const normalizedNumber = normalizeInvoiceNumber(payload.invoice_number);
  if (!payload.overrideDuplicate && normalizedNumber && payload.total_cents != null) {
    const existing = await deps.findDuplicateInvoice({
      businessId,
      vendorId,
      invoiceNumber: normalizedNumber,
      totalCents: payload.total_cents,
      excludeInvoiceId: invoice.id,
    });
    if (existing) {
      return { outcome: "duplicate", existingInvoiceId: existing };
    }
  }

  const departments = await deps.getDepartments(businessId);
  const departmentsById = new Map(departments.map((d) => [d.id, d]));

  // Resolve every mergeable line against the catalog.
  const mergeable = payload.lines.filter(isMergeableLine);
  const lineProducts = new Map<ConfirmLine, ProductRecord | null>();
  for (const line of mergeable) {
    const barcode = normalizeBarcode(line.barcode);
    const existing = barcode
      ? await deps.findProductByBarcode(businessId, barcode)
      : await deps.findProductByVendorName(
          businessId,
          vendorId,
          normalizeProductName(line.name as string),
        );
    lineProducts.set(line, existing);
  }

  // New products get an AI department in one batch call.
  const newLines = mergeable.filter((line) => !lineProducts.get(line));
  const assignments =
    newLines.length > 0
      ? await deps.assignDepartments(
          newLines.map((l) => l.name as string),
          departments,
        )
      : [];

  const productIdByLine = new Map<ConfirmLine, string>();
  const productIds: string[] = [];

  for (const [index, line] of newLines.entries()) {
    const assignment = assignments[index] ?? { department_id: null, confidence: 0 };
    const department = assignment.department_id
      ? departmentsById.get(assignment.department_id)
      : undefined;
    const cost = line.unit_cost_cents as number;
    const id = await deps.insertProduct({
      business_id: businessId,
      vendor_id: vendorId,
      barcode: normalizeBarcode(line.barcode),
      name: (line.name as string).trim(),
      normalized_name: normalizeProductName(line.name as string),
      department_id: department?.id ?? null,
      department_confidence: department ? assignment.confidence : null,
      current_cost_cents: cost,
      previous_cost_cents: null,
      sale_price_cents: department
        ? computeSalePrice(cost, department.target_markup)
        : null,
    });
    productIdByLine.set(line, id);
    productIds.push(id);
  }

  for (const line of mergeable) {
    const existing = lineProducts.get(line);
    if (!existing) continue;
    const cost = line.unit_cost_cents as number;
    const department = existing.department_id
      ? departmentsById.get(existing.department_id)
      : undefined;
    // The computed sale price follows the latest cost (SPEC §4). An explicit
    // override sticks — while it exists the computed price is left untouched.
    const recompute =
      existing.sale_price_override_cents == null && department != null;
    await deps.updateProductCost(existing.id, {
      previous_cost_cents: existing.current_cost_cents,
      current_cost_cents: cost,
      ...(recompute && department
        ? { sale_price_cents: computeSalePrice(cost, department.target_markup) }
        : {}),
    });
    productIdByLine.set(line, existing.id);
    productIds.push(existing.id);
  }

  await deps.replaceInvoiceLines(
    invoice.id,
    payload.lines.map((line) => ({
      id: line.id,
      business_id: businessId,
      invoice_id: invoice.id,
      product_id: productIdByLine.get(line) ?? null,
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

  // Unresolved illegible lines keep the invoice partial (SPEC §7.4); the
  // readable lines above have already flowed to the catalog.
  const status = payload.lines.some((l) => l.illegible) ? "partial" : "confirmed";
  await deps.updateInvoice(invoice.id, {
    vendor_id: vendorId,
    invoice_number: payload.invoice_number,
    invoice_date: payload.invoice_date,
    total_cents: payload.total_cents,
    status,
  });

  return { outcome: "confirmed", status, productIds };
}
