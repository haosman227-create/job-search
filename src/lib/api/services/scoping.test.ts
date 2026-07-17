import { describe, expect, it } from "vitest";
import { FakeSupabase } from "@/test/fake-supabase";
import type { ApiContext } from "../context";
import { setSalePriceOverride } from "./catalog";
import { deleteDepartment, listDepartments, updateDepartment } from "./settings";

/**
 * Cross-tenant boundary tests: every service must filter by the caller's
 * businessId explicitly (SPEC-SAAS §5 — API boundary first, RLS backstop).
 * The fake behaves like the database: a row only comes back when every eq()
 * filter matches, so tenant A operating on tenant B's rows must 404.
 */

const BIZ_A = "aaaaaaaa-0000-0000-0000-000000000000";
const BIZ_B = "bbbbbbbb-0000-0000-0000-000000000000";
const PRODUCT_B = "cccccccc-0000-0000-0000-000000000001";
const DEPT_B = "dddddddd-0000-0000-0000-000000000001";
const DEPT_A = "dddddddd-0000-0000-0000-000000000002";

function fixtures() {
  return new FakeSupabase({
    product: [
      {
        id: PRODUCT_B,
        business_id: BIZ_B,
        current_cost_cents: 100,
        sale_price_override_cents: null,
      },
    ],
    department: [
      { id: DEPT_B, business_id: BIZ_B, name: "Grocery", target_markup: 0.3, display_order: 1 },
      { id: DEPT_A, business_id: BIZ_A, name: "Snacks", target_markup: 0.4, display_order: 1 },
    ],
  });
}

function ctxFor(businessId: string, fake: FakeSupabase): ApiContext {
  return { supabase: fake.asClient(), userId: "user-1", businessId };
}

describe("tenant scoping at the API boundary", () => {
  it("tenant A cannot reach tenant B's product (404, no write)", async () => {
    const fake = fixtures();
    await expect(
      setSalePriceOverride(ctxFor(BIZ_A, fake), PRODUCT_B, 999),
    ).rejects.toMatchObject({ code: "not_found", status: 404 });
    // And the row was not modified.
    expect(fake.tables.product[0].sale_price_override_cents).toBeNull();
  });

  it("the owner can reach the same product", async () => {
    const fake = fixtures();
    await setSalePriceOverride(ctxFor(BIZ_B, fake), PRODUCT_B, 999);
    expect(fake.tables.product[0].sale_price_override_cents).toBe(999);
    // The boundary filter was actually applied to the queries.
    expect(fake.filtersFor("product", "business_id")).toContain(BIZ_B);
  });

  it("tenant A cannot update or delete tenant B's department", async () => {
    const fake = fixtures();
    await expect(
      updateDepartment(ctxFor(BIZ_A, fake), DEPT_B, {
        name: "Hijacked",
        targetMarkup: 0.9,
        displayOrder: 1,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    expect(fake.tables.department[0].name).toBe("Grocery");

    await expect(
      deleteDepartment(ctxFor(BIZ_A, fake), DEPT_B),
    ).rejects.toMatchObject({ code: "not_found" });
    expect(fake.tables.department).toHaveLength(2);
  });

  it("listDepartments only returns the caller's tenant", async () => {
    const fake = fixtures();
    const departments = await listDepartments(ctxFor(BIZ_A, fake));
    expect(departments).toHaveLength(1);
    expect(departments[0].id).toBe(DEPT_A);
  });
});
