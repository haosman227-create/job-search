import { describe, expect, it, vi } from "vitest";
import { assertGuardrail, currentPeriod, type GuardrailDeps } from "./enforce";
import { ApiError } from "@/lib/api/errors";

const BIZ = "b1111111-1111-4111-8111-111111111111";

function deps(overrides: Partial<GuardrailDeps> = {}): GuardrailDeps {
  return {
    loadTenant: vi.fn(async () => ({
      subscriptionStatus: "active" as const,
      trialEndsAt: "2026-08-01T00:00:00Z",
      limits: { monthlyInvoiceQuota: 50, marketRefreshQuota: 200 },
    })),
    loadUsage: vi.fn(async () => ({ invoicesProcessed: 0, marketRefreshes: 0 })),
    claudeEnabled: vi.fn(async () => true),
    now: () => new Date("2026-07-17T00:00:00Z"),
    ...overrides,
  };
}

async function reject(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    return error as ApiError;
  }
  throw new Error("expected the guardrail to throw");
}

describe("assertGuardrail", () => {
  it("passes a healthy account under quota", async () => {
    await expect(
      assertGuardrail(deps(), BIZ, "extraction"),
    ).resolves.toBeUndefined();
  });

  it("maps an invoice cap to a 402 quota_exceeded carrying the reason and numbers", async () => {
    const err = await reject(
      assertGuardrail(
        deps({
          loadUsage: vi.fn(async () => ({ invoicesProcessed: 50, marketRefreshes: 0 })),
        }),
        BIZ,
        "extraction",
      ),
    );
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("quota_exceeded");
    expect(err.status).toBe(402);
    expect(err.details).toMatchObject({ reason: "invoice_quota", limit: 50, used: 50 });
  });

  it("maps the global kill switch to a 503 service_unavailable", async () => {
    const err = await reject(
      assertGuardrail(deps({ claudeEnabled: vi.fn(async () => false) }), BIZ, "extraction"),
    );
    expect(err.code).toBe("service_unavailable");
    expect(err.status).toBe(503);
    expect(err.details).toMatchObject({ reason: "service_disabled" });
  });

  it("maps an elapsed trial to quota_exceeded/trial_ended", async () => {
    const err = await reject(
      assertGuardrail(
        deps({
          loadTenant: vi.fn(async () => ({
            subscriptionStatus: "trialing" as const,
            trialEndsAt: "2026-07-01T00:00:00Z",
            limits: { monthlyInvoiceQuota: 20, marketRefreshQuota: 50 },
          })),
        }),
        BIZ,
        "extraction",
      ),
    );
    expect(err.code).toBe("quota_exceeded");
    expect(err.details).toMatchObject({ reason: "trial_ended" });
  });

  it("fails closed when the tenant has no plan row", async () => {
    const err = await reject(
      assertGuardrail(deps({ loadTenant: vi.fn(async () => null) }), BIZ, "extraction"),
    );
    expect(err.code).toBe("service_unavailable");
  });

  it("checks usage for the current UTC month", async () => {
    const loadUsage = vi.fn(async () => ({ invoicesProcessed: 0, marketRefreshes: 0 }));
    await assertGuardrail(deps({ loadUsage }), BIZ, "extraction");
    expect(loadUsage).toHaveBeenCalledWith(BIZ, currentPeriod(new Date("2026-07-17T00:00:00Z")));
  });
});
