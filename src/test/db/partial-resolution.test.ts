import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { createTestDatabase } from "./harness";
import { createPgConfirmDeps } from "./confirm-deps-pg";
import { confirmInvoice } from "@/lib/catalog/confirm";
import { confirmInvoiceSchema } from "@/lib/catalog/confirm-schema";

const OWNER = "00000000-0000-0000-0000-000000000501";

let db: Client;
let bizId: string;
let groceryId: string;

function deps() {
  return createPgConfirmDeps(db, async (names) =>
    names.map(() => ({ department_id: groceryId, confidence: 0.9 })),
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

describe("partial invoice resolution (SPEC §7.4)", () => {
  it("leaves an invoice partial with an illegible line, then confirms it once fixed", async () => {
    const { rows } = await db.query(
      `insert into invoice (business_id, status, uploaded_by, file_paths)
       values ($1, 'needs_review', $2, '{f.jpg}') returning id`,
      [bizId, OWNER],
    );
    const invoiceId = rows[0].id;

    // First confirm: one good line, one illegible placeholder.
    const firstPass = confirmInvoiceSchema.parse({
      invoiceId,
      vendor_name: "Acme Foods",
      invoice_number: "INV-P1",
      invoice_date: "2026-07-01",
      total_cents: 800,
      lines: [
        {
          id: null,
          raw_text: "Readable jerky",
          barcode: null,
          name: "Beef Jerky 80g",
          quantity: 1,
          unit_cost_cents: 500,
          line_total_cents: 500,
        },
        {
          id: null,
          raw_text: "smudge ??",
          barcode: null,
          name: null,
          quantity: null,
          unit_cost_cents: null,
          line_total_cents: null,
          illegible: true,
        },
      ],
    });
    const firstResult = await confirmInvoice(deps(), firstPass);
    expect(firstResult).toMatchObject({ outcome: "confirmed", status: "partial" });

    // The readable line already made a product; the invoice is partial.
    expect(
      (await db.query("select status from invoice where id = $1", [invoiceId]))
        .rows[0].status,
    ).toBe("partial");
    expect(
      (
        await db.query(
          "select count(*)::int as n from product where business_id = $1",
          [bizId],
        )
      ).rows[0].n,
    ).toBe(1);

    // Owner comes back, reads the smudged line, and fills it in. Re-confirm the
    // partial invoice with the line no longer illegible.
    const secondPass = confirmInvoiceSchema.parse({
      invoiceId,
      vendor_name: "Acme Foods",
      invoice_number: "INV-P1",
      invoice_date: "2026-07-01",
      total_cents: 800,
      overrideDuplicate: true, // same vendor/number/total as its own first pass
      lines: [
        {
          id: null,
          raw_text: "Readable jerky",
          barcode: null,
          name: "Beef Jerky 80g",
          quantity: 1,
          unit_cost_cents: 500,
          line_total_cents: 500,
        },
        {
          id: null,
          raw_text: "smudge ??",
          barcode: null,
          name: "Trail Mix 100g",
          quantity: 1,
          unit_cost_cents: 300,
          line_total_cents: 300,
          illegible: false,
        },
      ],
    });
    const secondResult = await confirmInvoice(deps(), secondPass);
    expect(secondResult).toMatchObject({ outcome: "confirmed", status: "confirmed" });

    // Invoice is now fully confirmed and the resolved line became a product.
    expect(
      (await db.query("select status from invoice where id = $1", [invoiceId]))
        .rows[0].status,
    ).toBe("confirmed");
    const products = await db.query(
      "select name from product where business_id = $1 order by name",
      [bizId],
    );
    expect(products.rows.map((r) => r.name)).toEqual([
      "Beef Jerky 80g",
      "Trail Mix 100g",
    ]);
    // No lingering illegible lines on the invoice.
    expect(
      (
        await db.query(
          "select count(*)::int as n from invoice_line where invoice_id = $1 and illegible",
          [invoiceId],
        )
      ).rows[0].n,
    ).toBe(0);
  });
});
