import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { asUser, createTestDatabase } from "./harness";

/**
 * V2-3 recipes, against real Postgres: tenant isolation, cascade behavior,
 * and — the audit lesson applied at design time — the composite FKs that make
 * a cross-tenant ingredient reference impossible at the schema level.
 */

const USER_A = "00000000-0000-0000-0000-00000000000a";
const USER_B = "00000000-0000-0000-0000-00000000000b";

let db: Client;
let bizA: string;
let bizB: string;
let productA: string;
let productB: string;
let recipeA: string;

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

  const products = await db.query(
    `insert into product (business_id, name, normalized_name, current_cost_cents)
     values ($1, 'Mozzarella', 'mozzarella', 1140), ($2, 'Cheddar', 'cheddar', 900)
     returning id`,
    [bizA, bizB],
  );
  [productA, productB] = products.rows.map((r: { id: string }) => r.id);

  const recipes = await db.query(
    `insert into recipe (business_id, name, menu_price_cents)
     values ($1, 'Margherita', 1600) returning id`,
    [bizA],
  );
  recipeA = recipes.rows[0].id;
  await db.query(
    `insert into recipe_ingredient (business_id, recipe_id, product_id, quantity)
     values ($1, $2, $3, 0.25)`,
    [bizA, recipeA, productA],
  );
});

afterAll(async () => {
  await db?.end();
});

describe("recipes", () => {
  it("scopes recipes and ingredients to the owning tenant", async () => {
    const mine = await asUser(db, USER_A, () =>
      db.query("select name from recipe"),
    );
    expect(mine.rows).toEqual([{ name: "Margherita" }]);

    const theirs = await asUser(db, USER_B, () =>
      db.query("select * from recipe"),
    );
    expect(theirs.rows).toHaveLength(0);
  });

  it("makes a cross-tenant ingredient reference impossible at the schema level", async () => {
    // Even with a "valid" business_id of their own, tenant A cannot reference
    // tenant B's product: the composite FK (product_id, business_id) fails.
    await expect(
      db.query(
        `insert into recipe_ingredient (business_id, recipe_id, product_id, quantity)
         values ($1, $2, $3, 1)`,
        [bizA, recipeA, productB],
      ),
    ).rejects.toThrow(/foreign key/);
  });

  it("rejects non-positive quantities", async () => {
    await expect(
      db.query(
        `insert into recipe_ingredient (business_id, recipe_id, product_id, quantity)
         values ($1, $2, $3, 0)`,
        [bizA, recipeA, productA],
      ),
    ).rejects.toThrow(/check constraint/);
  });

  it("cascades ingredients when the recipe is deleted", async () => {
    const doomed = await db.query(
      `insert into recipe (business_id, name) values ($1, 'Doomed') returning id`,
      [bizA],
    );
    await db.query(
      `insert into recipe_ingredient (business_id, recipe_id, product_id, quantity)
       values ($1, $2, $3, 1)`,
      [bizA, doomed.rows[0].id, productA],
    );
    await db.query("delete from recipe where id = $1", [doomed.rows[0].id]);
    const orphans = await db.query(
      "select count(*)::int as n from recipe_ingredient where recipe_id = $1",
      [doomed.rows[0].id],
    );
    expect(orphans.rows[0].n).toBe(0);
  });
});
