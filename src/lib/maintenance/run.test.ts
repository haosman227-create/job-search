import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { runMaintenance, type MaintenanceDeps } from "./run";
import { setLogSink } from "@/lib/log/logger";

const NOW = new Date("2026-07-18T00:00:00Z");

let restoreLog: () => void;
beforeAll(() => {
  restoreLog = setLogSink(() => {});
});
afterAll(() => restoreLog());

function deps(overrides: Partial<MaintenanceDeps> = {}): MaintenanceDeps {
  return {
    listDueForPurge: vi.fn(async () => []),
    listInvoiceFilePaths: vi.fn(async () => []),
    removeFiles: vi.fn(async () => {}),
    deleteBusiness: vi.fn(async () => {}),
    listRetentionTenants: vi.fn(async () => []),
    listInvoicesWithFiles: vi.fn(async () => []),
    clearInvoiceFiles: vi.fn(async () => {}),
    deleteExpiredIdempotencyKeys: vi.fn(async () => {}),
    deleteExpiredRateWindows: vi.fn(async () => {}),
    deleteExpiredStripeEvents: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("runMaintenance — tenant purge", () => {
  it("removes a due tenant's files BEFORE deleting the row that references them", async () => {
    const order: string[] = [];
    const d = deps({
      listDueForPurge: vi.fn(async () => ["biz-1"]),
      listInvoiceFilePaths: vi.fn(async () => ["biz-1/inv/a.jpg", "biz-1/inv/b.jpg"]),
      removeFiles: vi.fn(async () => {
        order.push("removeFiles");
      }),
      deleteBusiness: vi.fn(async () => {
        order.push("deleteBusiness");
      }),
    });
    const summary = await runMaintenance(d, NOW);
    expect(order).toEqual(["removeFiles", "deleteBusiness"]);
    expect(d.removeFiles).toHaveBeenCalledWith(["biz-1/inv/a.jpg", "biz-1/inv/b.jpg"]);
    expect(summary.purgedTenants).toBe(1);
  });

  it("purges nothing when no tenant is past its grace period", async () => {
    const d = deps();
    const summary = await runMaintenance(d, NOW);
    expect(summary.purgedTenants).toBe(0);
    expect(d.deleteBusiness).not.toHaveBeenCalled();
  });
});

describe("runMaintenance — image retention sweep", () => {
  it("sweeps only invoices past the tenant's window and keeps recent ones", async () => {
    const d = deps({
      listRetentionTenants: vi.fn(async () => [
        { businessId: "biz-1", retentionDays: 90 },
      ]),
      listInvoicesWithFiles: vi.fn(async () => [
        { id: "old", createdAt: "2026-01-01T00:00:00Z", filePaths: ["b/old/1.jpg"] },
        { id: "recent", createdAt: "2026-07-10T00:00:00Z", filePaths: ["b/new/1.jpg"] },
      ]),
    });
    const summary = await runMaintenance(d, NOW);
    expect(summary.sweptInvoices).toBe(1);
    expect(d.removeFiles).toHaveBeenCalledExactlyOnceWith(["b/old/1.jpg"]);
    // Only the file references are cleared — the invoice row survives.
    expect(d.clearInvoiceFiles).toHaveBeenCalledExactlyOnceWith("old");
  });

  it("skips tenants without a retention window entirely", async () => {
    const d = deps();
    await runMaintenance(d, NOW);
    expect(d.listInvoicesWithFiles).not.toHaveBeenCalled();
  });
});

describe("runMaintenance — TTL cleanup", () => {
  it("expires bookkeeping rows on their documented windows", async () => {
    const d = deps();
    await runMaintenance(d, NOW);
    expect(d.deleteExpiredIdempotencyKeys).toHaveBeenCalledWith(
      "2026-07-17T00:00:00.000Z", // 24h
    );
    expect(d.deleteExpiredRateWindows).toHaveBeenCalledWith(
      "2026-07-17T22:00:00.000Z", // 2h
    );
    expect(d.deleteExpiredStripeEvents).toHaveBeenCalledWith(
      "2026-06-18T00:00:00.000Z", // 30d
    );
  });
});
