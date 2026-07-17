import { describe, expect, it } from "vitest";
import {
  DELETION_GRACE_DAYS,
  deletionStatus,
  purgeAfterFrom,
} from "./deletion";

describe("purgeAfterFrom", () => {
  it("schedules the purge a full grace window after the request", () => {
    const purge = purgeAfterFrom(new Date("2026-07-17T00:00:00Z"));
    const days =
      (Date.parse(purge) - Date.parse("2026-07-17T00:00:00Z")) /
      (24 * 60 * 60 * 1000);
    expect(days).toBe(DELETION_GRACE_DAYS);
  });
});

describe("deletionStatus", () => {
  it("reports no pending deletion for a normal account", () => {
    expect(
      deletionStatus({ deletionRequestedAt: null, purgeAfter: null, now: "2026-07-17T00:00:00Z" }),
    ).toEqual({
      pending: false,
      requestedAt: null,
      purgeAfter: null,
      daysRemaining: null,
      dueForPurge: false,
    });
  });

  it("counts the days left in the grace window", () => {
    const s = deletionStatus({
      deletionRequestedAt: "2026-07-10T00:00:00Z",
      purgeAfter: "2026-08-09T00:00:00Z",
      now: "2026-07-17T00:00:00Z",
    });
    expect(s.pending).toBe(true);
    expect(s.daysRemaining).toBe(23);
    expect(s.dueForPurge).toBe(false);
  });

  it("marks the account due for purge once the grace window elapses", () => {
    const s = deletionStatus({
      deletionRequestedAt: "2026-06-01T00:00:00Z",
      purgeAfter: "2026-07-01T00:00:00Z",
      now: "2026-07-17T00:00:00Z",
    });
    expect(s.dueForPurge).toBe(true);
    expect(s.daysRemaining).toBe(0);
  });
});
