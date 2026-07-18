import { requireBusinessContext } from "@/lib/data/business";
import { getCatalog } from "@/lib/api/services/catalog";
import { listInvoices } from "@/lib/api/services/invoices";
import { getOnboardingState } from "@/lib/api/services/onboarding";
import { getInsights } from "@/lib/api/services/insights";
import { computeDashboardStats } from "@/lib/dashboard/stats";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { InsightsFeed } from "@/components/dashboard/insights-feed";
import { OnboardingChecklist } from "@/components/onboarding/onboarding-checklist";
import { TrialBanner } from "@/components/onboarding/trial-banner";

export default async function DashboardPage() {
  const ctx = await requireBusinessContext();
  const [{ rows }, invoices, { onboarding, trial }, insights] =
    await Promise.all([
      getCatalog(ctx),
      listInvoices(ctx),
      getOnboardingState(ctx),
      getInsights(ctx),
    ]);

  const stats = computeDashboardStats(rows, invoices, new Date());

  return (
    <div className="flex flex-col gap-6">
      <TrialBanner trial={trial} />
      {!onboarding.complete && <OnboardingChecklist onboarding={onboarding} />}
      <DashboardView stats={stats} recentInvoices={invoices.slice(0, 5)} />
      <InsightsFeed insights={insights} />
    </div>
  );
}
