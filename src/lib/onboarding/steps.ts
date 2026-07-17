/**
 * Pure onboarding checklist (SPEC-SAAS §7, DoD step 2): the shortest path to a
 * new tenant's first extracted invoice, plus the couple of follow-ups that make
 * the workspace real. No I/O — the page loads the booleans from the tenant's
 * data and passes them in. The whole point is time-to-first-extraction, so the
 * first invoice is step one and everything else waits behind it.
 */

export interface OnboardingInput {
  hasUploadedInvoice: boolean;
  hasCatalogProduct: boolean;
  hasTeammate: boolean;
}

export interface OnboardingStep {
  id: "upload_invoice" | "confirm_catalog" | "invite_team";
  title: string;
  description: string;
  href: string;
  cta: string;
  done: boolean;
  /** A finished workspace doesn't need this step; it never blocks "complete". */
  optional: boolean;
}

export interface Onboarding {
  steps: OnboardingStep[];
  completedCount: number;
  totalCount: number;
  /** True once every required step is done (optional steps don't gate this). */
  complete: boolean;
  /** The next step to nudge, or null when nothing required remains. */
  nextStep: OnboardingStep | null;
}

export function computeOnboarding(input: OnboardingInput): Onboarding {
  const steps: OnboardingStep[] = [
    {
      id: "upload_invoice",
      title: "Upload your first invoice",
      description:
        "Snap a photo or drop a PDF of a supplier invoice. We'll extract every line item for you.",
      href: "/invoices/upload",
      cta: "Upload invoice",
      done: input.hasUploadedInvoice,
      optional: false,
    },
    {
      id: "confirm_catalog",
      title: "Confirm it to build your catalog",
      description:
        "Review the extracted lines and confirm. Your products, costs, and margins appear in the catalog.",
      href: "/invoices",
      cta: "Review invoices",
      done: input.hasCatalogProduct,
      optional: false,
    },
    {
      id: "invite_team",
      title: "Invite your team",
      description:
        "Add the people who handle deliveries and pricing so everyone works from one catalog.",
      href: "/settings",
      cta: "Invite a teammate",
      done: input.hasTeammate,
      optional: true,
    },
  ];

  const requiredSteps = steps.filter((s) => !s.optional);
  const complete = requiredSteps.every((s) => s.done);
  const nextStep = steps.find((s) => !s.done) ?? null;

  return {
    steps,
    completedCount: steps.filter((s) => s.done).length,
    totalCount: steps.length,
    complete,
    nextStep,
  };
}
