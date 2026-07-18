import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { asUser, createTestDatabase } from "./harness";

/**
 * Session 2 metering, against real Postgres: record_usage_event must append an
 * event and roll the tenant's period counters atomically, the append-only
 * tables must be read-only to tenants, and events must stay tenant-scoped.
 */

const USER_A = "00000000-0000-0000-0000-00000000000a";
const USER_B = "00000000-0000-0000-0000-00000000000b";

let db: Client;
let bizA: string;
let bizB: string;
let invoiceA: string;

/** The event's own period (UTC month), matching the SQL function. */
const period = new Date().toISOString().slice(0, 7);

async function record(
  businessId: string,
  operation: "extraction" | "market_pricing",
  opts: {
    invoiceId?: string | null;
    invoices?: number;
    lineItems?: number;
    storageBytes?: number;
    costMicroUsd?: number;
  } = {},
): Promise<string> {
  const res = await db.query(
    `select public.record_usage_event(
       $1, $2, $3, 'claude-sonnet-5', 1000, 200, $4, $5, $6, $7, $8
     ) as id`,
    [
      businessId,
      USER_A,
      operation,
      opts.costMicroUsd ?? 6000,
      opts.invoiceId ?? null,
      opts.invoices ?? 0,
      opts.lineItems ?? 0,
      opts.storageBytes ?? 0,
    ],
  );
  return res.rows[0].id;
}

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

  const invoice = await db.query(
    `insert into invoice (business_id, status) values ($1, 'processing') returning id`,
    [bizA],
  );
  invoiceA = invoice.rows[0].id;
});

afterAll(async () => {
  await db?.end();
});

describe("record_usage_event", () => {
  it("appends an event and seeds the period counters in one call", async () => {
    const id = await record(bizA, "extraction", {
      invoiceId: invoiceA,
      invoices: 1,
      lineItems: 3,
      storageBytes: 4096,
      costMicroUsd: 6000,
    });
    expect(id).toMatch(/^[0-9a-f-]{36}$/);

    const events = await db.query(
      "select * from usage_events where business_id = $1",
      [bizA],
    );
    expect(events.rows).toHaveLength(1);
    expect(events.rows[0]).toMatchObject({
      operation: "extraction",
      model: "claude-sonnet-5",
      input_tokens: 1000,
      output_tokens: 200,
      invoice_id: invoiceA,
    });
    expect(events.rows[0].cost_micro_usd).toBe("6000"); // bigint -> string

    const counters = await db.query(
      "select * from tenant_usage_period where business_id = $1 and period = $2",
      [bizA, period],
    );
    expect(counters.rows[0]).toMatchObject({
      invoices_processed: 1,
      line_items_extracted: 3,
    });
    expect(counters.rows[0].storage_bytes).toBe("4096");
  });

  it("accumulates counters across calls in the same period", async () => {
    await record(bizA, "extraction", {
      invoiceId: invoiceA,
      invoices: 2,
      lineItems: 5,
      storageBytes: 1000,
    });

    const counters = await db.query(
      "select * from tenant_usage_period where business_id = $1 and period = $2",
      [bizA, period],
    );
    // 1 + 2 invoices, 3 + 5 lines, 4096 + 1000 bytes from the previous test.
    expect(counters.rows[0].invoices_processed).toBe(3);
    expect(counters.rows[0].line_items_extracted).toBe(8);
    expect(counters.rows[0].storage_bytes).toBe("5096");
  });

  it("meters a market-pricing call without bumping the invoice count", async () => {
    const before = await db.query(
      "select invoices_processed from tenant_usage_period where business_id = $1 and period = $2",
      [bizA, period],
    );
    await record(bizA, "market_pricing", { costMicroUsd: 300 });

    const after = await db.query(
      "select invoices_processed from tenant_usage_period where business_id = $1 and period = $2",
      [bizA, period],
    );
    expect(after.rows[0].invoices_processed).toBe(
      before.rows[0].invoices_processed,
    );

    const marketEvents = await db.query(
      "select count(*)::int as n from usage_events where business_id = $1 and operation = 'market_pricing'",
      [bizA],
    );
    expect(marketEvents.rows[0].n).toBe(1);
  });

  it("keeps each tenant's counters and events isolated", async () => {
    await record(bizB, "extraction", { invoices: 1, lineItems: 2 });

    const a = await db.query(
      "select invoices_processed from tenant_usage_period where business_id = $1 and period = $2",
      [bizA, period],
    );
    const b = await db.query(
      "select invoices_processed from tenant_usage_period where business_id = $1 and period = $2",
      [bizB, period],
    );
    expect(a.rows[0].invoices_processed).toBe(3);
    expect(b.rows[0].invoices_processed).toBe(1);
  });
});

describe("record_invoice_processed (quota on success)", () => {
  it("bumps the period counters without creating a usage event", async () => {
    const before = await db.query(
      "select invoices_processed, line_items_extracted from tenant_usage_period where business_id = $1 and period = $2",
      [bizA, period],
    );
    const eventsBefore = await db.query(
      "select count(*)::int as n from usage_events where business_id = $1",
      [bizA],
    );

    await db.query("select record_invoice_processed($1, 2, 7, 512)", [bizA]);

    const after = await db.query(
      "select invoices_processed, line_items_extracted from tenant_usage_period where business_id = $1 and period = $2",
      [bizA, period],
    );
    expect(after.rows[0].invoices_processed).toBe(
      before.rows[0].invoices_processed + 2,
    );
    expect(after.rows[0].line_items_extracted).toBe(
      before.rows[0].line_items_extracted + 7,
    );

    // Counters only — the cost event was already written at call time.
    const eventsAfter = await db.query(
      "select count(*)::int as n from usage_events where business_id = $1",
      [bizA],
    );
    expect(eventsAfter.rows[0].n).toBe(eventsBefore.rows[0].n);
  });
});

describe("append-only RLS", () => {
  it("lets a tenant read only its own usage events and counters", async () => {
    const events = await asUser(db, USER_A, () =>
      db.query("select business_id from usage_events"),
    );
    expect(events.rows.length).toBeGreaterThan(0);
    expect(
      new Set(events.rows.map((r: { business_id: string }) => r.business_id)),
    ).toEqual(new Set([bizA]));

    const otherTenant = await asUser(db, USER_B, () =>
      db.query("select * from usage_events where business_id = $1", [bizA]),
    );
    expect(otherTenant.rows).toHaveLength(0);
  });

  it("forbids a tenant from writing usage rows directly (append-only)", async () => {
    await expect(
      asUser(db, USER_A, () =>
        db.query(
          `insert into usage_events (business_id, operation, model)
           values ($1, 'extraction', 'claude-sonnet-5')`,
          [bizA],
        ),
      ),
    ).rejects.toThrow(/row-level security/);

    await expect(
      asUser(db, USER_A, () =>
        db.query(
          "update tenant_usage_period set invoices_processed = 0 where business_id = $1",
          [bizA],
        ),
      ),
    ).resolves.toMatchObject({ rowCount: 0 });
  });
});
