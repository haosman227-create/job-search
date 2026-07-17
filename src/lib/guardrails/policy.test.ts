import { describe, expect, it } from "vitest";
import { evaluateGuardrail, type GuardrailInput } from "./policy";

function base(overrides: Partial<GuardrailInput> = {}): GuardrailInput {
  return {
    operation: "extraction",
    claudeEnabled: true,
    subscriptionStatus: "active",
    trialEndsAt: "2026-08-01T00:00:00Z",
    now: "2026-07-17T00:00:00Z",
    planLimits: { monthlyInvoiceQuota: 50, marketRefreshQuota: 200 },
    usage: { invoicesProcessed: 0, marketRefreshes: 0 },
    ...overrides,
  };
}

describe("evaluateGuardrail", () => {
  it("allows a call comfortably under the cap", () => {
    expect(evaluateGuardrail(base({ usage: { invoicesProcessed: 10, marketRefreshes: 0 } }))).toEqual({
      allowed: true,
    });
  });

  it("blocks every tenant when the global kill switch is off", () => {
    const d = evaluateGuardrail(base({ claudeEnabled: false, usage: { invoicesProcessed: 0, marketRefreshes: 0 } }));
    expect(d).toEqual({ allowed: false, reason: "service_disabled" });
  });

  it("kill switch beats an otherwise-fine account", () => {
    expect(
      evaluateGuardrail(base({ claudeEnabled: false, subscriptionStatus: "active" })).reason,
    ).toBe("service_disabled");
  });

  it("denies the call at exactly the cap (enforced before the Nth+1 call)", () => {
    const d = evaluateGuardrail(base({ usage: { invoicesProcessed: 50, marketRefreshes: 0 } }));
    expect(d).toEqual({ allowed: false, reason: "invoice_quota", limit: 50, used: 50 });
  });

  it("allows the very last call under the cap", () => {
    expect(
      evaluateGuardrail(base({ usage: { invoicesProcessed: 49, marketRefreshes: 0 } })).allowed,
    ).toBe(true);
  });

  it("gives trialing tenants read-only access once the trial elapses", () => {
    const d = evaluateGuardrail(
      base({ subscriptionStatus: "trialing", trialEndsAt: "2026-07-16T00:00:00Z" }),
    );
    expect(d).toEqual({ allowed: false, reason: "trial_ended" });
  });

  it("still serves a trialing tenant before the trial ends", () => {
    expect(
      evaluateGuardrail(
        base({ subscriptionStatus: "trialing", trialEndsAt: "2026-07-31T00:00:00Z" }),
      ).allowed,
    ).toBe(true);
  });

  it("blocks past_due and canceled subscriptions", () => {
    expect(evaluateGuardrail(base({ subscriptionStatus: "past_due" })).reason).toBe(
      "subscription_inactive",
    );
    expect(evaluateGuardrail(base({ subscriptionStatus: "canceled" })).reason).toBe(
      "subscription_inactive",
    );
  });

  it("caps market-pricing calls on their own quota, independent of invoices", () => {
    const overInvoices = base({
      operation: "market_pricing",
      usage: { invoicesProcessed: 999, marketRefreshes: 10 },
    });
    // Invoice count is irrelevant to a market call.
    expect(evaluateGuardrail(overInvoices).allowed).toBe(true);

    const overMarket = base({
      operation: "market_pricing",
      usage: { invoicesProcessed: 0, marketRefreshes: 200 },
    });
    expect(evaluateGuardrail(overMarket)).toEqual({
      allowed: false,
      reason: "market_quota",
      limit: 200,
      used: 200,
    });
  });
});
