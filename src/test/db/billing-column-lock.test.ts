import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { asUser, createTestDatabase } from "./harness";

/**
 * P0 security regression test: a tenant's own JWT must never be able to write
 * billing state. RLS scopes WHICH business row a member can update; the
 * column-level grants scope WHAT they can update on it. Without this, a tenant
 * could PATCH plan_id='pro' straight through PostgREST — a free upgrade.
 */

const USER_A = "00000000-0000-0000-0000-00000000000a";

let db: Client;
let bizA: string;

beforeAll(async () => {
  db = await createTestDatabase();
  await db.query("insert into auth.users (id, email) values ($1, $2)", [
    USER_A,
    "a@example.com",
  ]);
  const businesses = await db.query(
    "insert into business (name) values ('Biz A') returning id",
  );
  bizA = businesses.rows[0].id;
  await db.query("insert into membership (user_id, business_id) values ($1, $2)", [
    USER_A,
    bizA,
  ]);
});

afterAll(async () => {
  await db?.end();
});

describe("business column lock", () => {
  it("still lets a member update the columns the product intends", async () => {
    const renamed = await asUser(db, USER_A, () =>
      db.query("update business set name = 'Renamed' where id = $1", [bizA]),
    );
    expect(renamed.rowCount).toBe(1);

    const rights = await asUser(db, USER_A, () =>
      db.query(
        `update business set deletion_requested_at = now(),
           purge_after = now() + interval '30 days',
           image_retention_days = 90
         where id = $1`,
        [bizA],
      ),
    );
    expect(rights.rowCount).toBe(1);
  });

  it("denies a tenant JWT every billing/plan column", async () => {
    const forbidden = [
      "plan_id = 'pro'",
      "subscription_status = 'active'",
      "trial_ends_at = now() + interval '10 years'",
      "stripe_customer_id = 'cus_fake'",
      "stripe_subscription_id = 'sub_fake'",
    ];
    for (const assignment of forbidden) {
      await expect(
        asUser(db, USER_A, () =>
          db.query(`update business set ${assignment} where id = $1`, [bizA]),
        ),
        assignment,
      ).rejects.toThrow(/permission denied/);
    }
  });

  it("keeps the service role (superuser here) able to flip billing state", async () => {
    const res = await db.query(
      "update business set plan_id = 'growth', subscription_status = 'active' where id = $1",
      [bizA],
    );
    expect(res.rowCount).toBe(1);
  });
});
