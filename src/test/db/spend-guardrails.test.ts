import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { asUser, createTestDatabase } from "./harness";

/**
 * Session 3 guardrails, against real Postgres: the plan catalog and per-tenant
 * defaults, the market-refresh counter, the atomic rate limiter, idempotency
 * key uniqueness, and the RLS posture of the operator-only tables.
 */

const USER_A = "00000000-0000-0000-0000-00000000000a";
const USER_B = "00000000-0000-0000-0000-00000000000b";

let db: Client;
let bizA: string;
let bizB: string;

const period = new Date().toISOString().slice(0, 7);

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
});

afterAll(async () => {
  await db?.end();
});

describe("plan catalog & tenant defaults", () => {
  it("seeds the four self-serve plans in order", async () => {
    const res = await db.query(
      "select id, monthly_invoice_quota from plan order by sort_order",
    );
    expect(res.rows.map((r: { id: string }) => r.id)).toEqual([
      "trial",
      "starter",
      "growth",
      "pro",
    ]);
    // Trial's small cap bounds AI spend before a card is on file.
    expect(res.rows[0].monthly_invoice_quota).toBe(20);
  });

  it("puts a new business on a 14-day trial by default", async () => {
    const res = await db.query(
      `select plan_id, subscription_status,
              trial_ends_at > now() as trial_active,
              trial_ends_at < now() + interval '15 days' as bounded
       from business where id = $1`,
      [bizA],
    );
    expect(res.rows[0]).toMatchObject({
      plan_id: "trial",
      subscription_status: "trialing",
      trial_active: true,
      bounded: true,
    });
  });

  it("lets a signed-in tenant read the plan catalog but not operator tables", async () => {
    const plans = await asUser(db, USER_A, () =>
      db.query("select count(*)::int as n from plan"),
    );
    expect(plans.rows[0].n).toBe(4);

    // platform_setting has RLS on and no policy → invisible to tenants.
    const flags = await asUser(db, USER_A, () =>
      db.query("select * from platform_setting"),
    );
    expect(flags.rows).toHaveLength(0);
  });
});

describe("record_usage_event market counter", () => {
  it("bumps market_refreshes for a market-pricing call, not the invoice count", async () => {
    await db.query(
      `select record_usage_event($1, $2, 'market_pricing', 'claude-sonnet-5',
        1000, 200, 300, null, 0, 0, 0)`,
      [bizA, USER_A],
    );
    const res = await db.query(
      "select invoices_processed, market_refreshes from tenant_usage_period where business_id = $1 and period = $2",
      [bizA, period],
    );
    expect(res.rows[0].invoices_processed).toBe(0);
    expect(res.rows[0].market_refreshes).toBe(1);
  });
});

describe("bump_rate_limit", () => {
  it("returns a monotonically rising count within a window and isolates tenants", async () => {
    const first = await db.query("select bump_rate_limit($1, 'upload', 60) as n", [bizA]);
    const second = await db.query("select bump_rate_limit($1, 'upload', 60) as n", [bizA]);
    expect(first.rows[0].n).toBe(1);
    expect(second.rows[0].n).toBe(2);

    // A different tenant has its own counter.
    const other = await db.query("select bump_rate_limit($1, 'upload', 60) as n", [bizB]);
    expect(other.rows[0].n).toBe(1);

    // A different bucket is counted separately.
    const bucket = await db.query("select bump_rate_limit($1, 'market', 60) as n", [bizA]);
    expect(bucket.rows[0].n).toBe(1);
  });
});

describe("idempotency_key", () => {
  it("rejects a duplicate key for the same tenant but allows it for another", async () => {
    await db.query(
      "insert into idempotency_key (business_id, key, operation) values ($1, 'k1', 'invoice_upload')",
      [bizA],
    );
    await expect(
      db.query(
        "insert into idempotency_key (business_id, key, operation) values ($1, 'k1', 'invoice_upload')",
        [bizA],
      ),
    ).rejects.toThrow(/duplicate key/);

    // Same key string, different tenant, is a distinct request.
    await expect(
      db.query(
        "insert into idempotency_key (business_id, key, operation) values ($1, 'k1', 'invoice_upload')",
        [bizB],
      ),
    ).resolves.toMatchObject({ rowCount: 1 });
  });
});
