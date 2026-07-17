import { describe, expect, it } from "vitest";
import { buildAuditEntry, describeAudit } from "./entry";

describe("describeAudit", () => {
  it("summarizes actions with their metadata", () => {
    expect(describeAudit("invoice.confirmed", { lineCount: 12 })).toBe(
      "Confirmed invoice (12 lines)",
    );
    expect(describeAudit("member.invited", { email: "a@b.com" })).toBe(
      "Invited a@b.com",
    );
    expect(describeAudit("billing.plan_changed", { planId: "growth" })).toBe(
      "Plan changed to growth",
    );
    expect(describeAudit("product.price_override_set", { name: "Cola" })).toBe(
      "Set a manual sale price on Cola",
    );
  });

  it("degrades gracefully when metadata is missing", () => {
    expect(describeAudit("invoice.confirmed")).toBe("Confirmed invoice");
    expect(describeAudit("product.department_changed")).toBe(
      "Moved a product to a different department",
    );
    expect(describeAudit("department.created")).toBe("Created department");
  });
});

describe("buildAuditEntry", () => {
  it("maps input to the append-only row shape with a summary", () => {
    const row = buildAuditEntry({
      businessId: "biz-1",
      actorUserId: "user-1",
      action: "department.updated",
      entityType: "department",
      entityId: "dep-1",
      metadata: { name: "Beverages" },
    });
    expect(row).toEqual({
      business_id: "biz-1",
      actor_user_id: "user-1",
      action: "department.updated",
      entity_type: "department",
      entity_id: "dep-1",
      summary: "Updated department Beverages",
      metadata: { name: "Beverages" },
    });
  });

  it("keeps a null actor for system actions and defaults metadata/entity", () => {
    const row = buildAuditEntry({
      businessId: "biz-1",
      actorUserId: null,
      action: "billing.subscription_canceled",
      entityType: "subscription",
    });
    expect(row.actor_user_id).toBeNull();
    expect(row.entity_id).toBeNull();
    expect(row.metadata).toEqual({});
    expect(row.summary).toMatch(/free plan/);
  });
});
