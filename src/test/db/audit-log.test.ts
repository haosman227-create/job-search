import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { asUser, createTestDatabase } from "./harness";

/**
 * Session 6 audit log, against real Postgres: a tenant reads only its own
 * trail, and the table is append-only from the application path (no tenant
 * insert/update/delete — only the service-role recorder writes).
 */

const USER_A = "00000000-0000-0000-0000-00000000000a";
const USER_B = "00000000-0000-0000-0000-00000000000b";

let db: Client;
let bizA: string;
let bizB: string;

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

  // Seed as superuser (mimicking the service-role recorder).
  await db.query(
    `insert into audit_log (business_id, actor_user_id, action, entity_type, entity_id, summary)
     values ($1, $2, 'department.created', 'department', 'dep-1', 'Created department Beverages'),
            ($3, $4, 'invoice.confirmed', 'invoice', 'inv-1', 'Confirmed invoice (3 lines)')`,
    [bizA, USER_A, bizB, USER_B],
  );
});

afterAll(async () => {
  await db?.end();
});

describe("audit_log", () => {
  it("lets a tenant read only its own entries", async () => {
    const mine = await asUser(db, USER_A, () =>
      db.query("select business_id, action from audit_log"),
    );
    expect(mine.rows).toHaveLength(1);
    expect(mine.rows[0]).toMatchObject({
      business_id: bizA,
      action: "department.created",
    });

    const other = await asUser(db, USER_B, () =>
      db.query("select * from audit_log where business_id = $1", [bizA]),
    );
    expect(other.rows).toHaveLength(0);
  });

  it("is append-only: a tenant cannot insert, update, or delete", async () => {
    await expect(
      asUser(db, USER_A, () =>
        db.query(
          `insert into audit_log (business_id, actor_user_id, action, entity_type, summary)
           values ($1, $2, 'department.deleted', 'department', 'forged')`,
          [bizA, USER_A],
        ),
      ),
    ).rejects.toThrow(/row-level security/);

    // No update/delete policy → zero rows affected, no mutation.
    const upd = await asUser(db, USER_A, () =>
      db.query("update audit_log set summary = 'tampered' where business_id = $1", [
        bizA,
      ]),
    );
    expect(upd.rowCount).toBe(0);
    const del = await asUser(db, USER_A, () =>
      db.query("delete from audit_log where business_id = $1", [bizA]),
    );
    expect(del.rowCount).toBe(0);
  });

  it("records the full cross-tenant trail for the operator (superuser)", async () => {
    const all = await db.query("select count(*)::int as n from audit_log");
    expect(all.rows[0].n).toBe(2);
  });
});
