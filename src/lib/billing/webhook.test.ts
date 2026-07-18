import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { processStripeEvent, type WebhookDeps } from "./webhook";
import type { BusinessBillingState } from "./transition";

const BIZ = "b1111111-1111-4111-8111-111111111111";

function deps(overrides: Partial<WebhookDeps> = {}): WebhookDeps {
  const state: BusinessBillingState = {
    planId: "trial",
    subscriptionStatus: "trialing",
    stripeCustomerId: "cus_1",
    stripeSubscriptionId: null,
  };
  return {
    claimEvent: vi.fn(async () => "fresh" as const),
    markApplied: vi.fn(async () => {}),
    resolveBusinessByCustomer: vi.fn(async () => BIZ),
    planForPriceId: vi.fn(() => "starter"),
    loadBillingState: vi.fn(async () => state),
    saveBillingState: vi.fn(async () => {}),
    ...overrides,
  };
}

function checkoutEvent(): Stripe.Event {
  return {
    id: "evt_checkout",
    type: "checkout.session.completed",
    data: {
      object: {
        customer: "cus_1",
        subscription: "sub_1",
        metadata: { business_id: BIZ, plan_id: "growth" },
      },
    },
  } as unknown as Stripe.Event;
}

function subUpdatedEvent(status: string): Stripe.Event {
  return {
    id: "evt_sub",
    type: "customer.subscription.updated",
    data: {
      object: {
        id: "sub_1",
        customer: "cus_1",
        status,
        items: { data: [{ price: { id: "price_unknown" } }] },
      },
    },
  } as unknown as Stripe.Event;
}

describe("processStripeEvent", () => {
  it("applies a checkout, using metadata to find the tenant", async () => {
    const d = deps();
    const outcome = await processStripeEvent(d, checkoutEvent());
    expect(outcome).toBe("applied");
    // Metadata short-circuits the customer lookup.
    expect(d.resolveBusinessByCustomer).not.toHaveBeenCalled();
    expect(d.saveBillingState).toHaveBeenCalledWith(
      BIZ,
      expect.objectContaining({
        planId: "growth",
        subscriptionStatus: "active",
        stripeCustomerId: "cus_1",
        stripeSubscriptionId: "sub_1",
      }),
    );
  });

  it("skips a fully-applied redelivery without applying it twice", async () => {
    const d = deps({ claimEvent: vi.fn(async () => "done" as const) });
    const outcome = await processStripeEvent(d, checkoutEvent());
    expect(outcome).toBe("duplicate");
    expect(d.saveBillingState).not.toHaveBeenCalled();
    expect(d.markApplied).not.toHaveBeenCalled();
  });

  it("RESUMES an event whose earlier attempt died before applying", async () => {
    // The lost-update bug: claim succeeded, apply crashed, redelivery must
    // re-apply rather than treat the event as done.
    const d = deps({ claimEvent: vi.fn(async () => "unapplied" as const) });
    const outcome = await processStripeEvent(d, checkoutEvent());
    expect(outcome).toBe("applied");
    expect(d.saveBillingState).toHaveBeenCalledTimes(1);
    expect(d.markApplied).toHaveBeenCalledWith("evt_checkout");
  });

  it("leaves the event unapplied when saving state fails, so Stripe retries it", async () => {
    const d = deps({
      saveBillingState: vi.fn(async () => {
        throw new Error("db unavailable");
      }),
    });
    await expect(processStripeEvent(d, checkoutEvent())).rejects.toThrow(
      "db unavailable",
    );
    expect(d.markApplied).not.toHaveBeenCalled();
  });

  it("only marks applied after the state is saved", async () => {
    const order: string[] = [];
    const d = deps({
      saveBillingState: vi.fn(async () => {
        order.push("save");
      }),
      markApplied: vi.fn(async () => {
        order.push("markApplied");
      }),
    });
    await processStripeEvent(d, checkoutEvent());
    expect(order).toEqual(["save", "markApplied"]);
  });

  it("resolves a subscription event's tenant by Stripe customer id", async () => {
    const d = deps();
    const outcome = await processStripeEvent(d, subUpdatedEvent("past_due"));
    expect(outcome).toBe("applied");
    expect(d.resolveBusinessByCustomer).toHaveBeenCalledWith("cus_1");
    expect(d.saveBillingState).toHaveBeenCalledWith(
      BIZ,
      expect.objectContaining({ subscriptionStatus: "past_due" }),
    );
  });

  it("records but ignores an unhandled event type", async () => {
    const d = deps();
    const event = { id: "evt_x", type: "invoice.paid", data: { object: {} } } as unknown as Stripe.Event;
    const outcome = await processStripeEvent(d, event);
    expect(outcome).toBe("ignored");
    expect(d.claimEvent).toHaveBeenCalledWith("evt_x", "invoice.paid", null);
    expect(d.saveBillingState).not.toHaveBeenCalled();
  });

  it("reports no_tenant when the customer maps to no business", async () => {
    const d = deps({ resolveBusinessByCustomer: vi.fn(async () => null) });
    const outcome = await processStripeEvent(d, subUpdatedEvent("active"));
    expect(outcome).toBe("no_tenant");
    expect(d.saveBillingState).not.toHaveBeenCalled();
  });
});
