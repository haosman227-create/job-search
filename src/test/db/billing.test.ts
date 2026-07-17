import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { createTestDatabase } from "./harness";

/**
 * Session 5 billing schema, against real Postgres: plan display prices, the
 * business Stripe columns (customer id unique across tenants), and the
 * stripe_event table that makes webhook processing idempotent.
 */

let db: Client;
let bizA: string;
let bizB: string;

beforeAll(async () => {
  db = await createTestDatabase();
  const businesses = await db.query(
    "insert into business (name) values ('Biz A'), ('Biz B') returning id",
  );
  [bizA, bizB] = businesses.rows.map((r: { id: string }) => r.id);
});

afterAll(async () => {
  await db?.end();
});

describe("plan pricing", () => {
  it("stores monthly list prices as integer cents", async () => {
    const res = await db.query(
      "select id, price_cents from plan order by sort_order",
    );
    const byId = Object.fromEntries(
      res.rows.map((r: { id: string; price_cents: number }) => [r.id, r.price_cents]),
    );
    expect(byId).toEqual({ trial: 0, starter: 2900, growth: 7900, pro: 19900 });
  });
});

describe("business Stripe linkage", () => {
  it("defaults to no Stripe customer for a fresh tenant", async () => {
    const res = await db.query(
      "select stripe_customer_id, stripe_subscription_id from business where id = $1",
      [bizA],
    );
    expect(res.rows[0]).toEqual({
      stripe_customer_id: null,
      stripe_subscription_id: null,
    });
  });

  it("applies a paid subscription and reads it back", async () => {
    await db.query(
      `update business set plan_id = 'growth', subscription_status = 'active',
        stripe_customer_id = 'cus_a', stripe_subscription_id = 'sub_a'
       where id = $1`,
      [bizA],
    );
    const res = await db.query(
      "select plan_id, subscription_status, stripe_customer_id from business where id = $1",
      [bizA],
    );
    expect(res.rows[0]).toMatchObject({
      plan_id: "growth",
      subscription_status: "active",
      stripe_customer_id: "cus_a",
    });
  });

  it("never lets two tenants share one Stripe customer", async () => {
    await expect(
      db.query("update business set stripe_customer_id = 'cus_a' where id = $1", [
        bizB,
      ]),
    ).rejects.toThrow(/duplicate key/);
  });
});

describe("stripe_event idempotency", () => {
  it("records an event once and rejects a redelivery of the same id", async () => {
    await db.query(
      "insert into stripe_event (id, type, business_id) values ('evt_1', 'checkout.session.completed', $1)",
      [bizA],
    );
    await expect(
      db.query(
        "insert into stripe_event (id, type, business_id) values ('evt_1', 'checkout.session.completed', $1)",
        [bizA],
      ),
    ).rejects.toThrow(/duplicate key/);
  });
});
