import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { createTestDatabase } from "./harness";
import { createPgConfirmDeps } from "./confirm-deps-pg";
import { confirmInvoice } from "@/lib/catalog/confirm";
import {
  confirmInvoiceSchema,
  type ConfirmInvoicePayload,
} from "@/lib/catalog/confirm-schema";

const OWNER = "00000000-0000-0000-0000-000000000201";

let db: Client;
let bizId: string;
let groceryId: string;

function deps() {
  // Deterministic "AI": everything is Grocery at 0.9.
  return createPgConfirmDeps(db, async (names) =>
    names.map(() => ({ department_id: groceryId, confidence: 0.9 })),
  );
}

async function createUploadedInvoice(): Promise<string> {
  const { rows } = await db.query(
    `insert into invoice (business_id, status, uploaded_by, file_paths)
     values ($1, 'needs_review', $2, '{f.jpg}') returning id`,
    [bizId, OWNER],
  );
  return rows[0].id;
}

function payload(
  invoiceId: string,
  overrides: Partial<ConfirmInvoicePayload> = {},
): ConfirmInvoicePayload {
  return confirmInvoiceSchema.parse({
    invoiceId,
    vendor_name: "Acme Foods, Inc.",
    invoice_number: "INV-1001",
    invoice_date: "2026-07-01",
    total_cents: 3399,
    lines: [
      {
        id: null,
        raw_text: "cola line",
        barcode: "012345678905",
        name: "Cola 330ml",
        quantity: 24,
        unit_cost_cents: 75,
        line_total_cents: 1800,
      },
      {
        id: null,
        raw_text: "chips line",
        barcode: null,
        name: "Lay's Classic 50g",
        quantity: 13,
        unit_cost_cents: 123,
        line_total_cents: 1599,
      },
    ],
    ...overrides,
  });
}

beforeAll(async () => {
  db = await createTestDatabase();
  await db.query(
    `insert into auth.users (id, email, raw_user_meta_data)
     values ($1, 'owner@example.com', '{"business_name": "Corner Store"}')`,
    [OWNER],
  );
  const membership = await db.query(
    "select business_id from membership where user_id = $1",
    [OWNER],
  );
  bizId = membership.rows[0].business_id;
  const grocery = await db.query(
    "select id from department where business_id = $1 and name = 'Grocery'",
    [bizId],
  );
  groceryId = grocery.rows[0].id;
});

afterAll(async () => {
  await db?.end();
});

describe("confirmInvoice against real Postgres", () => {
  it("turns a reviewed invoice into catalog products with cost history", async () => {
    const invoiceId = await createUploadedInvoice();
    const result = await confirmInvoice(deps(), payload(invoiceId));

    expect(result.outcome).toBe("confirmed");

    const products = await db.query(
      "select * from product where business_id = $1 order by name",
      [bizId],
    );
    expect(products.rows).toHaveLength(2);
    const cola = products.rows.find((p) => p.name === "Cola 330ml");
    expect(cola).toMatchObject({
      barcode: "12345678905",
      department_id: groceryId,
      current_cost_cents: 75,
      sale_price_cents: 99,
    });

    // Traceability (SPEC §10): product -> invoice line -> invoice.
    const lines = await db.query(
      "select * from invoice_line where invoice_id = $1 order by name",
      [invoiceId],
    );
    expect(lines.rows).toHaveLength(2);
    expect(lines.rows.every((l) => l.product_id != null)).toBe(true);

    const invoice = await db.query("select * from invoice where id = $1", [invoiceId]);
    expect(invoice.rows[0]).toMatchObject({
      status: "confirmed",
      invoice_number: "INV-1001",
      total_cents: 3399,
    });
  });

  it("catches a re-uploaded duplicate and imports only with override", async () => {
    const duplicateId = await createUploadedInvoice();
    // Same vendor + number + total as the invoice confirmed above, with a
    // formatting difference the normalizer must see through.
    const warned = await confirmInvoice(
      deps(),
      payload(duplicateId, { invoice_number: "inv 1001" }),
    );
    expect(warned.outcome).toBe("duplicate");
    const stillPending = await db.query("select status from invoice where id = $1", [
      duplicateId,
    ]);
    expect(stillPending.rows[0].status).toBe("needs_review");

    const forced = await confirmInvoice(
      deps(),
      payload(duplicateId, { invoice_number: "inv 1001", overrideDuplicate: true }),
    );
    expect(forced.outcome).toBe("confirmed");
  });

  it("appends cost history on a later invoice and respects overrides", async () => {
    // Cost increase arrives for Cola.
    const secondId = await createUploadedInvoice();
    const second = payload(secondId, {
      invoice_number: "INV-2002",
      total_cents: 1920,
      lines: [
        {
          id: null,
          raw_text: "cola again",
          barcode: "12345678905",
          name: "Cola 330ml",
          quantity: 24,
          unit_cost_cents: 80,
          line_total_cents: 1920,
          confidence: {},
          illegible: false,
        },
      ],
    });
    await confirmInvoice(deps(), second);

    const cola = await db.query(
      "select * from product where business_id = $1 and barcode = '12345678905'",
      [bizId],
    );
    expect(cola.rows).toHaveLength(1); // merged, not duplicated
    expect(cola.rows[0]).toMatchObject({
      previous_cost_cents: 75,
      current_cost_cents: 80,
      sale_price_cents: 99, // 80 * 1.3 = 104 -> nearest .99
    });

    // Cost history = its invoice lines over time (including the duplicate
    // imported with an explicit override in the previous test).
    const history = await db.query(
      `select unit_cost_cents from invoice_line
       where product_id = $1 order by created_at`,
      [cola.rows[0].id],
    );
    expect(history.rows.map((r) => r.unit_cost_cents)).toEqual([75, 75, 80]);

    // Owner overrides the price; the next cost change must not touch it.
    await db.query(
      "update product set sale_price_override_cents = 149 where id = $1",
      [cola.rows[0].id],
    );
    const thirdId = await createUploadedInvoice();
    await confirmInvoice(
      deps(),
      payload(thirdId, {
        invoice_number: "INV-3003",
        total_cents: 2160,
        lines: [
          {
            id: null,
            raw_text: "cola yet again",
            barcode: "12345678905",
            name: "Cola 330ml",
            quantity: 24,
            unit_cost_cents: 90,
            line_total_cents: 2160,
            confidence: {},
            illegible: false,
          },
        ],
      }),
    );
    const after = await db.query("select * from product where id = $1", [
      cola.rows[0].id,
    ]);
    expect(after.rows[0]).toMatchObject({
      current_cost_cents: 90,
      sale_price_override_cents: 149,
      sale_price_cents: 99, // computed price frozen while override holds
    });
  });

  it("keeps illegible lines as placeholders and the invoice partial", async () => {
    const partialId = await createUploadedInvoice();
    const withIllegible = payload(partialId, {
      invoice_number: "INV-4004",
      total_cents: 500,
      lines: [
        {
          id: null,
          raw_text: "readable",
          barcode: null,
          name: "Sparkling water 1L",
          quantity: 6,
          unit_cost_cents: 65,
          line_total_cents: 390,
          confidence: {},
          illegible: false,
        },
        {
          id: null,
          raw_text: "???",
          barcode: null,
          name: null,
          quantity: null,
          unit_cost_cents: null,
          line_total_cents: null,
          confidence: {},
          illegible: true,
        },
      ],
    });
    const result = await confirmInvoice(deps(), withIllegible);
    expect(result).toMatchObject({ outcome: "confirmed", status: "partial" });

    const invoice = await db.query("select status from invoice where id = $1", [partialId]);
    expect(invoice.rows[0].status).toBe("partial");
    const placeholder = await db.query(
      "select * from invoice_line where invoice_id = $1 and illegible",
      [partialId],
    );
    expect(placeholder.rows).toHaveLength(1);
    expect(placeholder.rows[0].product_id).toBeNull();
    // The readable line still reached the catalog (SPEC §7.4).
    const water = await db.query(
      "select * from product where business_id = $1 and normalized_name = 'sparkling water 1l'",
      [bizId],
    );
    expect(water.rows).toHaveLength(1);
  });
});
