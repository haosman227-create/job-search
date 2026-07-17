import { describe, expect, it } from "vitest";
import { summarizeUsage } from "./summary";

const A = "biz-a";
const B = "biz-b";

describe("summarizeUsage", () => {
  it("groups by tenant + period and splits calls by operation", () => {
    const rows = summarizeUsage(
      [
        { businessId: A, businessName: "Acme", period: "2026-07", operation: "extraction", costMicroUsd: 60_000 },
        { businessId: A, businessName: "Acme", period: "2026-07", operation: "market_pricing", costMicroUsd: 300 },
        { businessId: A, businessName: "Acme", period: "2026-07", operation: "extraction", costMicroUsd: 40_000 },
      ],
      [{ businessId: A, period: "2026-07", invoicesProcessed: 2 }],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      businessId: A,
      businessName: "Acme",
      period: "2026-07",
      extractionCalls: 2,
      marketCalls: 1,
      totalCostMicroUsd: 100_300,
      invoicesProcessed: 2,
      // 100,300 / 2 = 50,150 micro-USD per invoice, integer.
      costPerInvoiceMicroUsd: 50_150,
    });
  });

  it("reports null cost-per-invoice when no invoices were processed", () => {
    const rows = summarizeUsage(
      [{ businessId: A, businessName: "Acme", period: "2026-07", operation: "market_pricing", costMicroUsd: 300 }],
      [{ businessId: A, period: "2026-07", invoicesProcessed: 0 }],
    );
    expect(rows[0].costPerInvoiceMicroUsd).toBeNull();
  });

  it("orders newest period first, then priciest tenant", () => {
    const rows = summarizeUsage(
      [
        { businessId: A, businessName: "Acme", period: "2026-06", operation: "extraction", costMicroUsd: 10 },
        { businessId: A, businessName: "Acme", period: "2026-07", operation: "extraction", costMicroUsd: 100 },
        { businessId: B, businessName: "Best", period: "2026-07", operation: "extraction", costMicroUsd: 500 },
      ],
      [],
    );
    expect(rows.map((r) => `${r.period}:${r.businessName}`)).toEqual([
      "2026-07:Best",
      "2026-07:Acme",
      "2026-06:Acme",
    ]);
  });

  it("keeps cost-per-invoice as integer micro-USD (never a float)", () => {
    const rows = summarizeUsage(
      [{ businessId: A, businessName: "Acme", period: "2026-07", operation: "extraction", costMicroUsd: 100 }],
      [{ businessId: A, period: "2026-07", invoicesProcessed: 3 }],
    );
    // 100 / 3 = 33.33... -> rounded to 33 micro-USD.
    expect(rows[0].costPerInvoiceMicroUsd).toBe(33);
    expect(Number.isInteger(rows[0].costPerInvoiceMicroUsd)).toBe(true);
  });
});
