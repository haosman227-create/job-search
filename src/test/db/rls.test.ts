import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { asUser, createTestDatabase } from "./harness";

const USER_A = "00000000-0000-0000-0000-00000000000a";
const USER_B = "00000000-0000-0000-0000-00000000000b";

let db: Client;
let bizA: string;
let bizB: string;
let vendorA: string;
let vendorB: string;

beforeAll(async () => {
  db = await createTestDatabase();

  await db.query("insert into auth.users (id, email) values ($1, $2), ($3, $4)", [
    USER_A,
    "a@example.com",
    USER_B,
    "b@example.com",
  ]);

  const businesses = await db.query(
    "insert into business (name) values ('Biz A'), ('Biz B') returning id",
  );
  [bizA, bizB] = businesses.rows.map((r: { id: string }) => r.id);

  await db.query(
    "insert into membership (user_id, business_id) values ($1, $2), ($3, $4)",
    [USER_A, bizA, USER_B, bizB],
  );

  const vendors = await db.query(
    `insert into vendor (business_id, name, normalized_name)
     values ($1, 'Acme Foods', 'acme foods'), ($2, 'Best Supply', 'best supply')
     returning id`,
    [bizA, bizB],
  );
  [vendorA, vendorB] = vendors.rows.map((r: { id: string }) => r.id);

  for (const [biz, vendor, name] of [
    [bizA, vendorA, "Cola 330ml"],
    [bizB, vendorB, "Chips 50g"],
  ] as const) {
    const product = await db.query(
      `insert into product (business_id, vendor_id, name, normalized_name, current_cost_cents)
       values ($1, $2, $3, lower($3), 100) returning id`,
      [biz, vendor, name],
    );
    const invoice = await db.query(
      `insert into invoice (business_id, vendor_id, invoice_number, total_cents, status)
       values ($1, $2, 'INV-1', 1000, 'confirmed') returning id`,
      [biz, vendor],
    );
    await db.query(
      `insert into invoice_line (business_id, invoice_id, product_id, name, quantity, unit_cost_cents, line_total_cents)
       values ($1, $2, $3, $4, 10, 100, 1000)`,
      [biz, invoice.rows[0].id, product.rows[0].id, name],
    );
  }

  await db.query(
    `insert into storage.objects (bucket_id, name)
     values ('invoices', $1 || '/inv1/photo.jpg'), ('invoices', $2 || '/inv9/photo.jpg')`,
    [bizA, bizB],
  );
});

afterAll(async () => {
  await db?.end();
});

describe("schema", () => {
  it("seeds the default departments for every new business", async () => {
    const res = await db.query(
      "select count(*)::int as n from department where business_id = $1",
      [bizA],
    );
    expect(res.rows[0].n).toBe(9);
  });

  it("rejects non-integer money values", async () => {
    await expect(
      db.query(
        `insert into product (business_id, name, normalized_name, current_cost_cents)
         values ($1, 'Bad', 'bad', $2)`,
        [bizA, 12.34],
      ),
    ).rejects.toThrow(/invalid input syntax for type integer/);
  });

  it("enforces product identity by barcode within a business, not across", async () => {
    await db.query(
      `insert into product (business_id, name, normalized_name, barcode)
       values ($1, 'Gum', 'gum', '123456')`,
      [bizA],
    );
    await expect(
      db.query(
        `insert into product (business_id, name, normalized_name, barcode)
         values ($1, 'Gum again', 'gum again', '123456')`,
        [bizA],
      ),
    ).rejects.toThrow(/duplicate key/);
    // The same barcode in another business is a different product.
    await db.query(
      `insert into product (business_id, name, normalized_name, barcode)
       values ($1, 'Gum', 'gum', '123456')`,
      [bizB],
    );
  });

  it("enforces vendor + normalized-name identity for barcode-less products", async () => {
    await expect(
      db.query(
        `insert into product (business_id, vendor_id, name, normalized_name)
         values ($1, $2, 'COLA 330ML', 'cola 330ml')`,
        [bizA, vendorA],
      ),
    ).rejects.toThrow(/duplicate key/);
  });
});

describe("row-level security", () => {
  const tables = [
    "business",
    "membership",
    "department",
    "vendor",
    "product",
    "invoice",
    "invoice_line",
  ];

  it("lets a member see only their own business's rows in every table", async () => {
    for (const table of tables) {
      const mine = await asUser(db, USER_A, () =>
        db.query(`select * from ${table}`),
      );
      expect(mine.rows.length, table).toBeGreaterThan(0);
      const businessIds = new Set(
        mine.rows.map(
          (r: { business_id?: string; id?: string }) =>
            r.business_id ?? r.id,
        ),
      );
      expect(businessIds, table).toEqual(new Set([bizA]));
    }
  });

  it("returns nothing without an authenticated user", async () => {
    for (const table of tables) {
      const rows = await asUser(db, "", () =>
        db.query(`select * from ${table}`),
      );
      expect(rows.rows.length, table).toBe(0);
    }
  });

  it("blocks inserting rows into another business", async () => {
    await expect(
      asUser(db, USER_A, () =>
        db.query(
          `insert into vendor (business_id, name, normalized_name)
           values ($1, 'Sneaky', 'sneaky')`,
          [bizB],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("makes another business's rows unreachable for update and delete", async () => {
    const upd = await asUser(db, USER_A, () =>
      db.query("update product set name = 'hacked' where business_id = $1", [
        bizB,
      ]),
    );
    expect(upd.rowCount).toBe(0);
    const del = await asUser(db, USER_A, () =>
      db.query("delete from invoice where business_id = $1", [bizB]),
    );
    expect(del.rowCount).toBe(0);
  });

  it("allows normal work inside your own business", async () => {
    const inserted = await asUser(db, USER_A, () =>
      db.query(
        `insert into vendor (business_id, name, normalized_name)
         values ($1, 'New Vendor', 'new vendor') returning id`,
        [bizA],
      ),
    );
    expect(inserted.rowCount).toBe(1);
  });

  it("scopes storage objects to the caller's business folder", async () => {
    const visible = await asUser(db, USER_A, () =>
      db.query("select name from storage.objects"),
    );
    expect(visible.rows).toHaveLength(1);
    expect(visible.rows[0].name.startsWith(`${bizA}/`)).toBe(true);

    await expect(
      asUser(db, USER_A, () =>
        db.query(
          "insert into storage.objects (bucket_id, name) values ('invoices', $1 || '/x/evil.jpg')",
          [bizB],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});
