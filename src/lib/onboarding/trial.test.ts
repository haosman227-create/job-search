import { describe, expect, it } from "vitest";
import { trialStatus } from "./trial";

const NOW = "2026-07-17T00:00:00Z";

describe("trialStatus", () => {
  it("says nothing to upsell on an active paid plan", () => {
    const s = trialStatus({
      subscriptionStatus: "active",
      trialEndsAt: "2026-01-01T00:00:00Z",
      now: NOW,
    });
    expect(s.state).toBe("active");
    expect(s.showUpgrade).toBe(false);
    expect(s.daysRemaining).toBeNull();
  });

  it("counts whole days left, rounding a partial day up", () => {
    const s = trialStatus({
      subscriptionStatus: "trialing",
      trialEndsAt: "2026-07-27T12:00:00Z", // 10.5 days out
      now: NOW,
    });
    expect(s.state).toBe("trialing");
    expect(s.daysRemaining).toBe(11);
    expect(s.showUpgrade).toBe(false);
    expect(s.headline).toContain("11 days");
  });

  it("nudges an upgrade in the last few trial days", () => {
    const s = trialStatus({
      subscriptionStatus: "trialing",
      trialEndsAt: "2026-07-19T00:00:00Z", // 2 days out
      now: NOW,
    });
    expect(s.state).toBe("trial_ending_soon");
    expect(s.daysRemaining).toBe(2);
    expect(s.showUpgrade).toBe(true);
  });

  it("uses the singular for the final day", () => {
    const s = trialStatus({
      subscriptionStatus: "trialing",
      trialEndsAt: "2026-07-17T18:00:00Z",
      now: NOW,
    });
    expect(s.daysRemaining).toBe(1);
    expect(s.headline).toContain("1 day left");
  });

  it("goes read-only, catalog-preserved, once the trial elapses", () => {
    const s = trialStatus({
      subscriptionStatus: "trialing",
      trialEndsAt: "2026-07-16T00:00:00Z",
      now: NOW,
    });
    expect(s.state).toBe("trial_ended");
    expect(s.daysRemaining).toBe(0);
    expect(s.showUpgrade).toBe(true);
    expect(s.detail).toMatch(/catalog stays available/i);
  });

  it("prompts billing repair on a past-due or canceled subscription", () => {
    for (const status of ["past_due", "canceled"] as const) {
      const s = trialStatus({
        subscriptionStatus: status,
        trialEndsAt: "2026-01-01T00:00:00Z",
        now: NOW,
      });
      expect(s.state).toBe("inactive");
      expect(s.showUpgrade).toBe(true);
    }
  });
});
