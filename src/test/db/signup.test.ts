import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { asUser, createTestDatabase } from "./harness";

const FOUNDER = "00000000-0000-0000-0000-000000000101";
const INVITEE = "00000000-0000-0000-0000-000000000102";

let db: Client;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db?.end();
});

describe("sign-up onboarding", () => {
  it("creates business, membership, and default departments atomically", async () => {
    await db.query(
      `insert into auth.users (id, email, raw_user_meta_data)
       values ($1, 'founder@example.com', '{"business_name": "  Corner Store  "}')`,
      [FOUNDER],
    );

    const membership = await db.query(
      "select business_id from membership where user_id = $1",
      [FOUNDER],
    );
    expect(membership.rowCount).toBe(1);
    const bizId = membership.rows[0].business_id;

    const business = await db.query("select name from business where id = $1", [
      bizId,
    ]);
    expect(business.rows[0].name).toBe("Corner Store");

    const departments = await db.query(
      "select count(*)::int as n from department where business_id = $1",
      [bizId],
    );
    expect(departments.rows[0].n).toBe(9);

    // And the new member can actually see their workspace through RLS.
    const visible = await asUser(db, FOUNDER, () =>
      db.query("select id from business"),
    );
    expect(visible.rows.map((r: { id: string }) => r.id)).toEqual([bizId]);
  });

  it("creates nothing for users without a business_name (invitees)", async () => {
    await db.query(
      `insert into auth.users (id, email) values ($1, 'invitee@example.com')`,
      [INVITEE],
    );
    const membership = await db.query(
      "select * from membership where user_id = $1",
      [INVITEE],
    );
    expect(membership.rowCount).toBe(0);
  });
});
