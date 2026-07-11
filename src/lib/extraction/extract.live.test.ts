import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Live smoke test against the real Claude API. Opt-in:
 *   LIVE_EXTRACTION_SMOKE=1 ANTHROPIC_API_KEY=... npx vitest run extract.live
 * Skipped everywhere else (CI has no API key).
 */
const enabled =
  process.env.LIVE_EXTRACTION_SMOKE === "1" && !!process.env.ANTHROPIC_API_KEY;

describe.skipIf(!enabled)("extractWithClaude (live)", () => {
  it("extracts the sample invoice photo end to end", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "unused";
    process.env.SUPABASE_SERVICE_ROLE_KEY ??= "unused";
    const { extractWithClaude } = await import("./client");

    const base64 = readFileSync(
      path.join(__dirname, "fixtures/sample-invoice.png"),
    ).toString("base64");

    const result = await extractWithClaude([
      { mediaType: "image/png", base64 },
    ]);

    expect(result.invoices).toHaveLength(1);
    const invoice = result.invoices[0];
    expect(invoice.vendor_name?.toLowerCase()).toContain("acme");
    expect(invoice.invoice_number?.toUpperCase()).toContain("1001");
    expect(invoice.invoice_date).toBe("2026-07-01");
    expect(invoice.total_cents).toBe(4237);
    expect(invoice.lines).toHaveLength(4);
    const cola = invoice.lines.find((l) => l.barcode?.includes("12345678905"));
    expect(cola?.unit_cost_cents).toBe(75);
    expect(cola?.line_total_cents).toBe(1800);
  }, 120_000);
});
