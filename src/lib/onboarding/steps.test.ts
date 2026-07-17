import { describe, expect, it } from "vitest";
import { computeOnboarding } from "./steps";

describe("computeOnboarding", () => {
  it("puts uploading the first invoice front and center for a brand-new tenant", () => {
    const o = computeOnboarding({
      hasUploadedInvoice: false,
      hasCatalogProduct: false,
      hasTeammate: false,
    });
    expect(o.complete).toBe(false);
    expect(o.completedCount).toBe(0);
    expect(o.nextStep?.id).toBe("upload_invoice");
    expect(o.nextStep?.href).toBe("/invoices/upload");
  });

  it("advances to confirming once an invoice exists", () => {
    const o = computeOnboarding({
      hasUploadedInvoice: true,
      hasCatalogProduct: false,
      hasTeammate: false,
    });
    expect(o.nextStep?.id).toBe("confirm_catalog");
    expect(o.completedCount).toBe(1);
    expect(o.complete).toBe(false);
  });

  it("is complete once the required steps are done, even without a teammate", () => {
    const o = computeOnboarding({
      hasUploadedInvoice: true,
      hasCatalogProduct: true,
      hasTeammate: false,
    });
    expect(o.complete).toBe(true);
    // The optional invite is still surfaced as the next nudge.
    expect(o.nextStep?.id).toBe("invite_team");
    expect(o.nextStep?.optional).toBe(true);
  });

  it("has no next step once everything, including the optional invite, is done", () => {
    const o = computeOnboarding({
      hasUploadedInvoice: true,
      hasCatalogProduct: true,
      hasTeammate: true,
    });
    expect(o.complete).toBe(true);
    expect(o.completedCount).toBe(3);
    expect(o.nextStep).toBeNull();
  });

  it("never lets the optional teammate step gate completion", () => {
    const o = computeOnboarding({
      hasUploadedInvoice: true,
      hasCatalogProduct: true,
      hasTeammate: false,
    });
    const invite = o.steps.find((s) => s.id === "invite_team");
    expect(invite?.optional).toBe(true);
    expect(o.complete).toBe(true);
  });
});
