import { describe, expect, it, vi } from "vitest";
import { runIdempotent, type IdempotencyOps } from "./idempotency";
import { ApiError } from "@/lib/api/errors";

function ops(overrides: Partial<IdempotencyOps> = {}): IdempotencyOps {
  return {
    claim: vi.fn(async () => "claimed" as const),
    loadExisting: vi.fn(async () => null),
    saveResponse: vi.fn(async () => {}),
    release: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("runIdempotent", () => {
  it("runs the work once and stores the response on a fresh claim", async () => {
    const o = ops();
    const out = await runIdempotent(o, async () => ({ invoiceId: "inv-1" }));
    expect(out).toEqual({ result: { invoiceId: "inv-1" }, replayed: false });
    expect(o.saveResponse).toHaveBeenCalledWith({ invoiceId: "inv-1" });
    expect(o.release).not.toHaveBeenCalled();
  });

  it("releases the key when the work fails, so a retry can run again", async () => {
    // The poisoning bug: a 402/422 used to leave the claimed key behind and
    // every retry got 409 forever.
    const o = ops();
    await expect(
      runIdempotent(o, async () => {
        throw new ApiError("quota_exceeded", "over cap");
      }),
    ).rejects.toMatchObject({ code: "quota_exceeded" });
    expect(o.release).toHaveBeenCalledTimes(1);
    expect(o.saveResponse).not.toHaveBeenCalled();
  });

  it("replays the stored response for a completed key without re-running", async () => {
    const produce = vi.fn(async () => ({ invoiceId: "new" }));
    const o = ops({
      claim: vi.fn(async () => "exists" as const),
      loadExisting: vi.fn(async () => ({
        response: { invoiceId: "original" },
        ageSeconds: 5,
      })),
    });
    const out = await runIdempotent(o, produce);
    expect(out).toEqual({ result: { invoiceId: "original" }, replayed: true });
    expect(produce).not.toHaveBeenCalled();
  });

  it("409s while a fresh claim is still in flight", async () => {
    const o = ops({
      claim: vi.fn(async () => "exists" as const),
      loadExisting: vi.fn(async () => ({ response: null, ageSeconds: 3 })),
    });
    await expect(runIdempotent(o, async () => ({}))).rejects.toMatchObject({
      code: "invalid_state",
    });
  });

  it("takes over a stale claim whose owner crashed mid-flight", async () => {
    const claim = vi
      .fn<() => Promise<"claimed" | "exists">>()
      .mockResolvedValueOnce("exists")
      .mockResolvedValueOnce("claimed");
    const o = ops({
      claim,
      loadExisting: vi.fn(async () => ({ response: null, ageSeconds: 120 })),
    });
    const out = await runIdempotent(o, async () => ({ invoiceId: "retry" }));
    expect(out.replayed).toBe(false);
    expect(o.release).toHaveBeenCalledTimes(1);
    expect(claim).toHaveBeenCalledTimes(2);
  });
});
