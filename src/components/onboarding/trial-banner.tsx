import Link from "next/link";
import type { TrialStatus } from "@/lib/onboarding/trial";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Trial / subscription banner (SPEC-SAAS §7). Hidden on an active paid plan;
 * otherwise it shows where the trial stands and, when it matters, a
 * non-scary upgrade nudge. The upgrade path itself arrives with billing.
 */
export function TrialBanner({ trial }: { trial: TrialStatus }) {
  if (trial.state === "active") return null;

  const urgent =
    trial.state === "trial_ended" || trial.state === "inactive";

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between",
        urgent
          ? "border-destructive/40 bg-destructive/5"
          : "border-border bg-muted/40",
      )}
    >
      <div>
        <p className="font-medium">{trial.headline}</p>
        <p className="text-sm text-muted-foreground">{trial.detail}</p>
      </div>
      {trial.showUpgrade && (
        <Button
          render={<Link href="/settings" />}
          variant={urgent ? "default" : "outline"}
          size="sm"
          className="shrink-0"
        >
          View plans
        </Button>
      )}
    </div>
  );
}
