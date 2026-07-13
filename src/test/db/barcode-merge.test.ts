import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { createTestDatabase } from "./harness";
import { createPgConfirmDeps } from "./confirm-deps-pg";
import { attachBarcode, type BarcodeAttachDeps, type MergeLine } from "@/lib/catalog/merge";
import { confirmInvoice } from "@/lib/catalog/confirm";
import { confirmInvoiceSchema } from "@/lib/catalog/confirm-schema";
import { normalizeBarcode } from "@/lib/domain";

const OWNER = "00000000-0000-0000-0000-000000000401";

let db: Client;
let bizId: string;
let groceryId: string;

function confirmDeps() {
  return createPgConfirmDeps(db, async (names) =>
    names.map(() => ({ department_id: groceryId, confidence: 0.9 })),
  );
}

// Barcode-attach deps bound to raw Postgres, mirroring the Supabase adapter.
function attachDeps(): BarcodeAttachDeps {
  return {
    normalizeBarcode,
    async loadProduct(id) {
      const { rows } = await db.query(
        "select id, business_id, barcode, department_id, sale_price_override_cents from product where id = $1",
        [id],
      );
      return rows[0] ?? null;
    },
    async findProductByBarcode(businessId, barcode) {
      const { rows } = await db.query(
        "select id, business_id, barcode, department_id, sale_price_override_cents from product where business_id = $1 and barcode = $2",
        [businessId, barcode],
      );
      return rows[0] ?? null;
    },
    async getDepartmentMarkup(departmentId) {
      const { rows } = await db.query(
        "select target_markup from department where id = $1",
        [departmentId],
      );
      return rows[0]?.target_markup != null ? Number(rows[0].target_markup) : null;
    },
    async listLines(productId) {
      const { rows } = await db.query(
        `select il.unit_cost_cents, il.created_at, i.invoice_date
         from invoice_line il join invoice i on i.id = il.invoice_id
         where il.product_id = $1`,
        [productId],
      );
      return rows.map(
        (r): MergeLine => ({
          unit_cost_cents: r.unit_cost_cents,
          invoice_date: r.invoice_date,
          created_at:
            r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
        }),
      );
    },
    async setBarcode(productId, barcode) {
      await db.query("update product set barcode = $2 where id = $1", [productId, barcode]);
    },
    async repointLines(fromId, toId) {
      await db.query("update invoice_line set product_id = $2 where product_id = $1", [
        fromId,
        toId,
      ]);
    },
    async updateCost(productId, cost) {
      if ("sale_price_cents" in cost) {
        await db.query(
          "update product set previous_cost_cents = $2, current_cost_cents = $3, sale_price_cents = $4 where id = $1",
          [productId, cost.previous_cost_cents, cost.current_cost_cents, cost.sale_price_cents],
        );
      } else {
        await db.query(
          "update product set previous_cost_cents = $2, current_cost_cents = $3 where id = $1",
          [productId, cost.previous_cost_cents, cost.current_cost_cents],
        );
      }
    },
    async deleteProduct(productId) {
      await db.query("delete from product where id = $1", [productId]);
    },
  };
}

async function confirmLine(params: {
  invoiceNumber: string;
  date: string;
  barcode: string | null;
  name: string;
  costCents: number;
}) {
  const { rows } = await db.query(
    `insert into invoice (business_id, status, uploaded_by, file_paths)
     values ($1, 'needs_review', $2, '{f.jpg}') returning id`,
    [bizId, OWNER],
  );
  await confirmInvoice(
    confirmDeps(),
    confirmInvoiceSchema.parse({
      invoiceId: rows[0].id,
      vendor_name: "Acme Foods",
      invoice_number: params.invoiceNumber,
      invoice_date: params.date,
      total_cents: params.costCents,
      lines: [
        {
          id: null,
          raw_text: params.name,
          barcode: params.barcode,
          name: params.name,
          quantity: 1,
          unit_cost_cents: params.costCents,
          line_total_cents: params.costCents,
        },
      ],
    }),
  );
}

beforeAll(async () => {
  db = await createTestDatabase();
  await db.query(
    `insert into auth.users (id, email, raw_user_meta_data)
     values ($1, 'owner@example.com', '{"business_name": "Corner Store"}')`,
    [OWNER],
  );
  bizId = (
    await db.query("select business_id from membership where user_id = $1", [OWNER])
  ).rows[0].business_id;
  groceryId = (
    await db.query(
      "select id from department where business_id = $1 and name = 'Grocery'",
      [bizId],
    )
  ).rows[0].id;
});

afterAll(async () => {
  await db?.end();
});

describe("barcode attach and merge (SPEC §7.2)", () => {
  it("attaches a barcode to a barcode-less product", async () => {
    await confirmLine({
      invoiceNumber: "INV-N1",
      date: "2026-07-01",
      barcode: null,
      name: "Loose Widget",
      costCents: 500,
    });
    const before = await db.query(
      "select id, barcode from product where normalized_name = 'loose widget'",
    );
    expect(before.rows[0].barcode).toBeNull();

    const result = await attachBarcode(attachDeps(), {
      productId: before.rows[0].id,
      barcode: "0 11122233344",
    });
    expect(result.outcome).toBe("attached");
    const after = await db.query("select barcode from product where id = $1", [
      before.rows[0].id,
    ]);
    expect(after.rows[0].barcode).toBe("11122233344");
  });

  it("merges a barcode-less and a barcoded twin, combining cost history", async () => {
    // Same item created both ways: earlier barcode-less line, later barcoded line.
    await confirmLine({
      invoiceNumber: "INV-M1",
      date: "2026-06-01",
      barcode: null,
      name: "Twin Soda",
      costCents: 1000,
    });
    await confirmLine({
      invoiceNumber: "INV-M2",
      date: "2026-06-20",
      barcode: "55566677788",
      name: "Twin Soda barcoded",
      costCents: 1200,
    });

    const nameless = await db.query(
      "select id from product where normalized_name = 'twin soda'",
    );
    const barcoded = await db.query(
      "select id from product where barcode = '55566677788'",
    );
    expect(nameless.rows).toHaveLength(1);
    expect(barcoded.rows).toHaveLength(1);

    const result = await attachBarcode(attachDeps(), {
      productId: nameless.rows[0].id,
      barcode: "55566677788",
    });
    expect(result).toMatchObject({
      outcome: "merged",
      survivingProductId: barcoded.rows[0].id,
      removedProductId: nameless.rows[0].id,
    });

    // One product remains for that barcode; the other is gone.
    const remaining = await db.query(
      "select id, current_cost_cents, previous_cost_cents from product where barcode = '55566677788'",
    );
    expect(remaining.rows).toHaveLength(1);
    expect(
      (await db.query("select id from product where id = $1", [nameless.rows[0].id]))
        .rows,
    ).toHaveLength(0);

    // Combined cost history (both invoice lines) now hangs off the survivor,
    // newest cost is current.
    const history = await db.query(
      `select il.unit_cost_cents from invoice_line il join invoice i on i.id = il.invoice_id
       where il.product_id = $1 order by i.invoice_date`,
      [barcoded.rows[0].id],
    );
    expect(history.rows.map((r) => r.unit_cost_cents)).toEqual([1000, 1200]);
    expect(remaining.rows[0]).toMatchObject({
      previous_cost_cents: 1000,
      current_cost_cents: 1200,
    });
  });
});
