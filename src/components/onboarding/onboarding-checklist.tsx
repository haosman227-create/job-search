import Link from "next/link";
import type { Onboarding } from "@/lib/onboarding/steps";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * First-run checklist (SPEC-SAAS §7). The shortest path to a first extracted
 * invoice, with the next action always one click away. The page hides this once
 * the required steps are done.
 */
export function OnboardingChecklist({ onboarding }: { onboarding: Onboarding }) {
  return (
    <section className="flex flex-col gap-4 rounded-lg border bg-card p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Get started
          </h2>
          <p className="text-sm text-muted-foreground">
            {onboarding.completedCount} of {onboarding.totalCount} done
          </p>
        </div>
      </div>

      <ol className="flex flex-col gap-3">
        {onboarding.steps.map((step) => {
          const isNext = onboarding.nextStep?.id === step.id;
          return (
            <li
              key={step.id}
              className={cn(
                "flex items-start gap-3 rounded-md border p-3",
                isNext ? "border-primary/40 bg-primary/5" : "border-transparent",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-xs",
                  step.done
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-muted-foreground/40 text-muted-foreground",
                )}
              >
                {step.done ? "✓" : ""}
              </span>
              <div className="flex-1">
                <p
                  className={cn(
                    "font-medium",
                    step.done && "text-muted-foreground line-through",
                  )}
                >
                  {step.title}
                  {step.optional && !step.done && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      optional
                    </span>
                  )}
                </p>
                <p className="text-sm text-muted-foreground">
                  {step.description}
                </p>
                {isNext && (
                  <Button
                    render={<Link href={step.href} />}
                    size="sm"
                    className="mt-3"
                  >
                    {step.cta}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
