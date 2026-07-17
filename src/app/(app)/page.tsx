import Link from "next/link";
import { requireBusinessContext } from "@/lib/data/business";
import { getCatalog } from "@/lib/api/services/catalog";
import { getOnboardingState } from "@/lib/api/services/onboarding";
import { CatalogTable } from "@/components/catalog/catalog-table";
import { OnboardingChecklist } from "@/components/onboarding/onboarding-checklist";
import { TrialBanner } from "@/components/onboarding/trial-banner";
import { Button } from "@/components/ui/button";

export default async function CatalogPage() {
  const ctx = await requireBusinessContext();
  const [{ rows, departments, vendors }, { onboarding, trial }] =
    await Promise.all([getCatalog(ctx), getOnboardingState(ctx)]);

  return (
    <div className="flex flex-col gap-6">
      <TrialBanner trial={trial} />

      {/* Guide new tenants to their first extracted invoice; retire the
          checklist once the required steps are done. */}
      {!onboarding.complete && <OnboardingChecklist onboarding={onboarding} />}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Catalog</h1>
        <Button render={<Link href="/invoices/upload" />}>Upload invoice</Button>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground">
          No products yet. Upload a supplier invoice and confirm it to start
          building the catalog.
        </p>
      ) : (
        <CatalogTable rows={rows} departments={departments} vendors={vendors} />
      )}
    </div>
  );
}
