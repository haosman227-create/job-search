import { describe, expect, it } from "vitest";
import {
  applyBillingEvent,
  mapStripeStatus,
  type BusinessBillingState,
} from "./transition";

const trialing: BusinessBillingState = {
  planId: "trial",
  subscriptionStatus: "trialing",
  stripeCustomerId: null,
  stripeSubscriptionId: null,
};

describe("mapStripeStatus", () => {
  it("treats active and Stripe-side trialing as active", () => {
    expect(mapStripeStatus("active")).toBe("active");
    expect(mapStripeStatus("trialing")).toBe("active");
  });
  it("treats dunning states as past_due", () => {
    expect(mapStripeStatus("past_due")).toBe("past_due");
    expect(mapStripeStatus("unpaid")).toBe("past_due");
    expect(mapStripeStatus("incomplete")).toBe("past_due");
  });
  it("treats terminal states as canceled", () => {
    expect(mapStripeStatus("canceled")).toBe("canceled");
    expect(mapStripeStatus("incomplete_expired")).toBe("canceled");
  });
});

describe("applyBillingEvent", () => {
  it("activates the chosen plan and records Stripe ids on checkout", () => {
    const next = applyBillingEvent(trialing, {
      type: "checkout_completed",
      customerId: "cus_1",
      subscriptionId: "sub_1",
      planId: "growth",
    });
    expect(next).toEqual({
      planId: "growth",
      subscriptionStatus: "active",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
    });
  });

  it("reflects an upgrade while the subscription stays active", () => {
    const active: BusinessBillingState = {
      planId: "starter",
      subscriptionStatus: "active",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
    };
    const next = applyBillingEvent(active, {
      type: "subscription_updated",
      customerId: "cus_1",
      subscriptionId: "sub_1",
      planId: "pro",
      stripeStatus: "active",
    });
    expect(next.planId).toBe("pro");
    expect(next.subscriptionStatus).toBe("active");
  });

  it("marks a failed payment past_due without dropping the plan", () => {
    const active: BusinessBillingState = {
      planId: "growth",
      subscriptionStatus: "active",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
    };
    const next = applyBillingEvent(active, {
      type: "subscription_updated",
      customerId: "cus_1",
      subscriptionId: "sub_1",
      planId: "growth",
      stripeStatus: "past_due",
    });
    expect(next.subscriptionStatus).toBe("past_due");
    expect(next.planId).toBe("growth");
  });

  it("falls back to the free plan when an update reports cancellation", () => {
    const active: BusinessBillingState = {
      planId: "pro",
      subscriptionStatus: "active",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
    };
    const next = applyBillingEvent(active, {
      type: "subscription_updated",
      customerId: "cus_1",
      subscriptionId: "sub_1",
      planId: "pro",
      stripeStatus: "canceled",
    });
    expect(next.planId).toBe("trial");
    expect(next.subscriptionStatus).toBe("canceled");
  });

  it("degrades gracefully on deletion: canceled, free plan, subscription forgotten", () => {
    const active: BusinessBillingState = {
      planId: "pro",
      subscriptionStatus: "active",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
    };
    const next = applyBillingEvent(active, {
      type: "subscription_deleted",
      customerId: "cus_1",
      subscriptionId: "sub_1",
      planId: null,
    });
    expect(next).toEqual({
      planId: "trial",
      subscriptionStatus: "canceled",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: null,
    });
  });

  it("keeps the current plan if a checkout arrives without a resolved plan", () => {
    const next = applyBillingEvent(trialing, {
      type: "checkout_completed",
      customerId: "cus_1",
      subscriptionId: "sub_1",
      planId: null,
    });
    expect(next.planId).toBe("trial");
    expect(next.subscriptionStatus).toBe("active");
  });
});
