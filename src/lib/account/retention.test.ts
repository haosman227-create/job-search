import { describe, expect, it } from "vitest";
import { invoicesPastRetention } from "./retention";

const NOW = "2026-07-17T00:00:00Z";

const invoices = [
  { id: "old", createdAt: "2026-01-01T00:00:00Z" }, // ~197 days ago
  { id: "recent", createdAt: "2026-07-10T00:00:00Z" }, // 7 days ago
];

describe("invoicesPastRetention", () => {
  it("returns images older than the retention window", () => {
    expect(invoicesPastRetention(invoices, 30, NOW)).toEqual(["old"]);
  });

  it("keeps everything when retention is generous", () => {
    expect(invoicesPastRetention(invoices, 365, NOW)).toEqual([]);
  });

  it("treats null retention as keep-forever", () => {
    expect(invoicesPastRetention(invoices, null, NOW)).toEqual([]);
  });

  it("purges everything past a tiny window", () => {
    expect(invoicesPastRetention(invoices, 1, NOW).sort()).toEqual([
      "old",
      "recent",
    ]);
  });
});
