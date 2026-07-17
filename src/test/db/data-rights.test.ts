import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { createTestDatabase } from "./harness";

/**
 * Session 7 data-rights schema, against real Postgres: the deletion + retention
 * columns, their constraints, and that a purge job can find due tenants.
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

describe("data-rights columns", () => {
  it("defaults to no pending deletion and no retention window", async () => {
    const res = await db.query(
      "select deletion_requested_at, purge_after, image_retention_days from business where id = $1",
      [bizA],
    );
    expect(res.rows[0]).toEqual({
      deletion_requested_at: null,
      purge_after: null,
      image_retention_days: null,
    });
  });

  it("rejects a non-positive retention window", async () => {
    await expect(
      db.query("update business set image_retention_days = 0 where id = $1", [bizA]),
    ).rejects.toThrow(/violates check constraint/);
  });

  it("accepts a positive retention window", async () => {
    await db.query("update business set image_retention_days = 90 where id = $1", [
      bizA,
    ]);
    const res = await db.query(
      "select image_retention_days from business where id = $1",
      [bizA],
    );
    expect(res.rows[0].image_retention_days).toBe(90);
  });
});

describe("deletion scheduling", () => {
  it("lets a purge job find tenants past their grace period", async () => {
    // Biz A requested deletion and is already past purge_after; Biz B just now.
    await db.query(
      `update business set deletion_requested_at = now() - interval '31 days',
        purge_after = now() - interval '1 day' where id = $1`,
      [bizA],
    );
    await db.query(
      `update business set deletion_requested_at = now(),
        purge_after = now() + interval '30 days' where id = $1`,
      [bizB],
    );

    const due = await db.query(
      "select id from business where purge_after is not null and purge_after < now()",
    );
    const ids = due.rows.map((r: { id: string }) => r.id);
    expect(ids).toContain(bizA);
    expect(ids).not.toContain(bizB);
  });
});
