"use client";

import type { Insight } from "@/lib/insights/price-intel";
import { Stagger, StaggerItem } from "@/components/motion/primitives";
import { cn } from "@/lib/utils";

/**
 * The proactive feed (V2-2): what moved, what it costs per month, what to do.
 * One line per card — the summary already says everything.
 */
export function InsightsFeed({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-medium">Price watch</h2>
      <Stagger className="flex flex-col gap-2">
        {insights.slice(0, 5).map((insight) => {
          const good = insight.kind === "price_drop";
          return (
            <StaggerItem key={`${insight.kind}-${insight.productId}`}>
              <div
                className={cn(
                  "surface flex items-center gap-3 rounded-xl border-l-2 p-4",
                  good
                    ? "border-l-positive"
                    : insight.severity === "high"
                      ? "border-l-destructive"
                      : "border-l-primary",
                )}
              >
                <span
                  className={cn(
                    "tabular shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold",
                    good
                      ? "bg-positive/12 text-positive"
                      : insight.severity === "high"
                        ? "bg-destructive/12 text-destructive"
                        : "bg-primary/12 text-primary",
                  )}
                >
                  {insight.changePct > 0 ? "+" : ""}
                  {insight.changePct}%
                </span>
                <p className="text-sm">{insight.summary}</p>
              </div>
            </StaggerItem>
          );
        })}
      </Stagger>
    </div>
  );
}
