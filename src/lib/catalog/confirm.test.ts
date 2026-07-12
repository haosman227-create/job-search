import { describe, expect, it, vi } from "vitest";
import { confirmInvoice, type ConfirmDeps } from "./confirm";
import {
  confirmInvoiceSchema,
  type ConfirmInvoicePayload,
} from "./confirm-schema";

const BIZ = "b1111111-1111-1111-1111-111111111111";
const INVOICE = "11111111-1111-4111-8111-111111111111";
const GROCERY = { id: "dep-grocery", name: "Grocery", target_markup: 0.3 };
const TOBACCO = { id: "dep-tobacco", name: "Tobacco", target_markup: 0.12 };

function payload(
  overrides: Partial<ConfirmInvoicePayload> = {},
): ConfirmInvoicePayload {
  return confirmInvoiceSchema.parse({
    invoiceId: INVOICE,
    vendor_name: "Acme Foods, Inc.",
    invoice_number: "INV-1001",
    invoice_date: "2026-07-01",
    total_cents: 1800,
    lines: [
      {
        id: null,
        raw_text: "cola",
        barcode: "012345678905",
        name: "Cola 330ml",
        quantity: 24,
        unit_cost_cents: 75,
        line_total_cents: 1800,
      },
    ],
    ...overrides,
  });
}

function stubDeps(overrides: Partial<ConfirmDeps> = {}): ConfirmDeps {
  return {
    loadInvoice: vi.fn(async (id: string) => ({
      id,
      business_id: BIZ,
      status: "needs_review",
    })),
    upsertVendor: vi.fn(async () => "vendor-1"),
    findDuplicateInvoice: vi.fn(async () => null),
    getDepartments: vi.fn(async () => [GROCERY, TOBACCO]),
    assignDepartments: vi.fn(async (names: string[]) =>
      names.map(() => ({ department_id: GROCERY.id, confidence: 0.9 })),
    ),
    findProductByBarcode: vi.fn(async () => null),
    findProductByVendorName: vi.fn(async () => null),
    insertProduct: vi.fn(async () => "product-new"),
    updateProductCost: vi.fn(async () => {}),
    replaceInvoiceLines: vi.fn(async () => {}),
    updateInvoice: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("confirmInvoice", () => {
  it("creates a product with AI department and computed sale price", async () => {
    const deps = stubDeps();
    const result = await confirmInvoice(deps, payload());

    expect(result).toEqual({
      outcome: "confirmed",
      status: "confirmed",
      productIds: ["product-new"],
    });
    expect(deps.upsertVendor).toHaveBeenCalledWith(BIZ, "Acme Foods, Inc.", "acme foods");
    expect(deps.insertProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        barcode: "12345678905", // normalized: leading zero dropped
        normalized_name: "cola 330ml",
        department_id: GROCERY.id,
        department_confidence: 0.9,
        current_cost_cents: 75,
        // 75 * 1.3 = 97.5 -> 98 -> nearest 9-ending is 99
        sale_price_cents: 99,
      }),
    );
    const lines = vi.mocked(deps.replaceInvoiceLines).mock.calls[0][1];
    expect(lines[0].product_id).toBe("product-new");
    expect(deps.updateInvoice).toHaveBeenCalledWith(
      INVOICE,
      expect.objectContaining({ status: "confirmed", vendor_id: "vendor-1" }),
    );
  });

  it("appends cost history to an existing product and recomputes its price", async () => {
    const deps = stubDeps({
      findProductByBarcode: vi.fn(async () => ({
        id: "product-existing",
        department_id: GROCERY.id,
        current_cost_cents: 60,
        sale_price_override_cents: null,
      })),
    });
    const result = await confirmInvoice(deps, payload());

    expect(result).toMatchObject({ outcome: "confirmed", productIds: ["product-existing"] });
    expect(deps.insertProduct).not.toHaveBeenCalled();
    expect(deps.assignDepartments).not.toHaveBeenCalled();
    expect(deps.updateProductCost).toHaveBeenCalledWith("product-existing", {
      previous_cost_cents: 60,
      current_cost_cents: 75,
      sale_price_cents: 99,
    });
  });

  it("never touches the price of a manually overridden product", async () => {
    const deps = stubDeps({
      findProductByBarcode: vi.fn(async () => ({
        id: "product-overridden",
        department_id: GROCERY.id,
        current_cost_cents: 60,
        sale_price_override_cents: 89,
      })),
    });
    await confirmInvoice(deps, payload());

    expect(deps.updateProductCost).toHaveBeenCalledWith("product-overridden", {
      previous_cost_cents: 60,
      current_cost_cents: 75,
      // no sale_price_cents key: computed price untouched while override holds
    });
    const fields = vi.mocked(deps.updateProductCost).mock.calls[0][1];
    expect("sale_price_cents" in fields).toBe(false);
  });

  it("returns the duplicate warning unless explicitly overridden", async () => {
    const deps = stubDeps({
      findDuplicateInvoice: vi.fn(async () => "existing-invoice"),
    });

    const warned = await confirmInvoice(deps, payload());
    expect(warned).toEqual({ outcome: "duplicate", existingInvoiceId: "existing-invoice" });
    expect(deps.insertProduct).not.toHaveBeenCalled();
    expect(deps.updateInvoice).not.toHaveBeenCalled();

    const forced = await confirmInvoice(deps, payload({ overrideDuplicate: true }));
    expect(forced.outcome).toBe("confirmed");
    expect(deps.findDuplicateInvoice).toHaveBeenCalledTimes(1); // skipped on override
  });

  it("keeps invoices with unresolved illegible lines partial", async () => {
    const deps = stubDeps();
    const withIllegible = payload();
    withIllegible.lines.push(
      confirmInvoiceSchema.shape.lines.element.parse({
        id: null,
        raw_text: "smudge",
        barcode: null,
        name: null,
        quantity: null,
        unit_cost_cents: null,
        line_total_cents: null,
        illegible: true,
      }),
    );

    const result = await confirmInvoice(deps, withIllegible);
    expect(result).toMatchObject({ outcome: "confirmed", status: "partial" });
    const lines = vi.mocked(deps.replaceInvoiceLines).mock.calls[0][1];
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatchObject({ illegible: true, product_id: null });
  });

  it("matches barcode-less lines by vendor + normalized name", async () => {
    const deps = stubDeps({
      findProductByVendorName: vi.fn(async () => ({
        id: "product-by-name",
        department_id: null,
        current_cost_cents: 30,
        sale_price_override_cents: null,
      })),
    });
    const noBarcode = payload();
    noBarcode.lines[0].barcode = null;
    noBarcode.lines[0].name = "COLA   330ML";

    await confirmInvoice(deps, noBarcode);
    expect(deps.findProductByVendorName).toHaveBeenCalledWith(BIZ, "vendor-1", "cola 330ml");
    // No department on the product -> cost updates but no computed price.
    const fields = vi.mocked(deps.updateProductCost).mock.calls[0][1];
    expect(fields.current_cost_cents).toBe(75);
    expect("sale_price_cents" in fields).toBe(false);
  });

  it("rejects invoices in the wrong status", async () => {
    const deps = stubDeps({
      loadInvoice: vi.fn(async (id: string) => ({
        id,
        business_id: BIZ,
        status: "confirmed",
      })),
    });
    const result = await confirmInvoice(deps, payload());
    expect(result.outcome).toBe("invalid");
  });
});
