import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { createTestDatabase } from "./harness";
import { createPgConfirmDeps } from "./confirm-deps-pg";
import { confirmInvoice } from "@/lib/catalog/confirm";
import { confirmInvoiceSchema } from "@/lib/catalog/confirm-schema";

const OWNER = "00000000-0000-0000-0000-000000000301";

let db: Client;
let bizId: string;
let groceryId: string;

function deps() {
  return createPgConfirmDeps(db, async (names) =>
    names.map(() => ({ department_id: groceryId, confidence: 0.9 })),
  );
}

async function confirmProduct(params: {
  invoiceNumber: string;
  barcode: string;
  name: string;
  costCents: number;
}) {
  const { rows } = await db.query(
    `insert into invoice (business_id, status, uploaded_by, file_paths)
     values ($1, 'needs_review', $2, '{f.jpg}') returning id`,
    [bizId, OWNER],
  );
  const invoiceId = rows[0].id;
  await confirmInvoice(
    deps(),
    confirmInvoiceSchema.parse({
      invoiceId,
      vendor_name: "Acme Foods",
      invoice_number: params.invoiceNumber,
      invoice_date: "2026-07-01",
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
  // Pin Grocery to a known markup for the test.
  await db.query(
    "update department set target_markup = 0.30 where business_id = $1 and name = 'Grocery'",
    [bizId],
  );
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

describe("department markup change", () => {
  it("applies to new products only; existing prices stay put", async () => {
    // Product A confirmed at the 30% markup: $10.00 -> $13.00 -> $12.99.
    await confirmProduct({
      invoiceNumber: "INV-A",
      barcode: "11111111111",
      name: "Product A",
      costCents: 1000,
    });
    const aBefore = await db.query(
      "select sale_price_cents from product where barcode = '11111111111'",
    );
    expect(aBefore.rows[0].sale_price_cents).toBe(1299);

    // Owner raises Grocery's markup to 50% (what the settings action does).
    await db.query(
      "update department set target_markup = 0.50 where id = $1",
      [groceryId],
    );

    // Product B confirmed after the change: $10.00 -> $15.00 -> $14.99.
    await confirmProduct({
      invoiceNumber: "INV-B",
      barcode: "22222222222",
      name: "Product B",
      costCents: 1000,
    });
    const b = await db.query(
      "select sale_price_cents from product where barcode = '22222222222'",
    );
    expect(b.rows[0].sale_price_cents).toBe(1499);

    // Product A is untouched by the markup change (no cost change, no edit).
    const aAfter = await db.query(
      "select sale_price_cents from product where barcode = '11111111111'",
    );
    expect(aAfter.rows[0].sale_price_cents).toBe(1299);
  });

  it("sets a deleted department's products to unassigned (FK on delete)", async () => {
    // A spare department with one product, then delete it.
    const spare = await db.query(
      `insert into department (business_id, name, target_markup, display_order)
       values ($1, 'Spare', 0.2, 50) returning id`,
      [bizId],
    );
    const spareId = spare.rows[0].id;
    const product = await db.query(
      `insert into product (business_id, name, normalized_name, department_id, current_cost_cents)
       values ($1, 'Orphan', 'orphan', $2, 100) returning id`,
      [bizId, spareId],
    );
    await db.query("delete from department where id = $1", [spareId]);
    const after = await db.query("select department_id from product where id = $1", [
      product.rows[0].id,
    ]);
    expect(after.rows[0].department_id).toBeNull();
  });
});
