import type { Client } from "pg";
import { normalizeInvoiceNumber } from "@/lib/domain";
import type { ConfirmDeps, DepartmentAssignment, DepartmentRecord } from "@/lib/catalog/confirm";

/**
 * Test-only ConfirmDeps over raw Postgres: proves the engine's SQL semantics
 * (identity indexes, cost history, duplicate predicate) against the real
 * schema. Department assignment is injected per-test — no Claude here.
 */
export function createPgConfirmDeps(
  db: Client,
  assignDepartments: (
    names: string[],
    departments: DepartmentRecord[],
  ) => Promise<DepartmentAssignment[]>,
): ConfirmDeps {
  return {
    async loadInvoice(invoiceId) {
      const { rows } = await db.query(
        "select id, business_id, status from invoice where id = $1",
        [invoiceId],
      );
      return rows[0] ?? null;
    },
    async upsertVendor(businessId, name, normalizedName) {
      const { rows } = await db.query(
        `insert into vendor (business_id, name, normalized_name)
         values ($1, $2, $3)
         on conflict (business_id, normalized_name)
         do update set name = vendor.name
         returning id`,
        [businessId, name, normalizedName],
      );
      return rows[0].id;
    },
    async findDuplicateInvoice(params) {
      const { rows } = await db.query(
        `select id, invoice_number from invoice
         where business_id = $1 and vendor_id = $2 and total_cents = $3
           and status in ('confirmed', 'partial') and id <> $4`,
        [params.businessId, params.vendorId, params.totalCents, params.excludeInvoiceId],
      );
      const match = rows.find(
        (row: { invoice_number: string | null }) =>
          normalizeInvoiceNumber(row.invoice_number) === params.invoiceNumber,
      );
      return match?.id ?? null;
    },
    async getDepartments(businessId) {
      const { rows } = await db.query(
        "select id, name, target_markup from department where business_id = $1",
        [businessId],
      );
      return rows.map((d: { id: string; name: string; target_markup: string }) => ({
        id: d.id,
        name: d.name,
        target_markup: Number(d.target_markup),
      }));
    },
    assignDepartments,
    async findProductByBarcode(businessId, barcode) {
      const { rows } = await db.query(
        `select id, department_id, current_cost_cents, sale_price_override_cents
         from product where business_id = $1 and barcode = $2`,
        [businessId, barcode],
      );
      return rows[0] ?? null;
    },
    async findProductByVendorName(businessId, vendorId, normalizedName) {
      const { rows } = await db.query(
        `select id, department_id, current_cost_cents, sale_price_override_cents
         from product
         where business_id = $1 and vendor_id = $2 and normalized_name = $3
           and barcode is null`,
        [businessId, vendorId, normalizedName],
      );
      return rows[0] ?? null;
    },
    async insertProduct(p) {
      const { rows } = await db.query(
        `insert into product (business_id, vendor_id, barcode, name, normalized_name,
           department_id, department_confidence, current_cost_cents, previous_cost_cents,
           sale_price_cents)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
        [
          p.business_id,
          p.vendor_id,
          p.barcode,
          p.name,
          p.normalized_name,
          p.department_id,
          p.department_confidence,
          p.current_cost_cents,
          p.previous_cost_cents,
          p.sale_price_cents,
        ],
      );
      return rows[0].id;
    },
    async updateProductCost(productId, fields) {
      if ("sale_price_cents" in fields) {
        await db.query(
          `update product set previous_cost_cents = $2, current_cost_cents = $3,
             sale_price_cents = $4, updated_at = now() where id = $1`,
          [productId, fields.previous_cost_cents, fields.current_cost_cents, fields.sale_price_cents],
        );
      } else {
        await db.query(
          `update product set previous_cost_cents = $2, current_cost_cents = $3,
             updated_at = now() where id = $1`,
          [productId, fields.previous_cost_cents, fields.current_cost_cents],
        );
      }
    },
    async replaceInvoiceLines(invoiceId, lines) {
      await db.query("delete from invoice_line where invoice_id = $1", [invoiceId]);
      for (const line of lines) {
        await db.query(
          `insert into invoice_line (business_id, invoice_id, product_id, raw_text,
             barcode, name, quantity, unit_cost_cents, line_total_cents, confidence, illegible)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            line.business_id,
            line.invoice_id,
            line.product_id,
            line.raw_text,
            line.barcode,
            line.name,
            line.quantity,
            line.unit_cost_cents,
            line.line_total_cents,
            JSON.stringify(line.confidence),
            line.illegible,
          ],
        );
      }
    },
    async updateInvoice(invoiceId, fields) {
      await db.query(
        `update invoice set vendor_id = $2, invoice_number = $3, invoice_date = $4,
           total_cents = $5, status = $6, updated_at = now() where id = $1`,
        [
          invoiceId,
          fields.vendor_id,
          fields.invoice_number,
          fields.invoice_date,
          fields.total_cents,
          fields.status,
        ],
      );
    },
  };
}
