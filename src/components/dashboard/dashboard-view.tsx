"use client";

import Link from "next/link";
import { formatCents } from "@/lib/domain";
import type { DashboardStats } from "@/lib/dashboard/stats";
import type { InvoiceListItem } from "@/lib/types";
import { CountUp, FadeUp, Stagger, StaggerItem } from "@/components/motion/primitives";
import { InvoiceStatusBadge } from "@/components/invoice-status-badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Numbers-first home (SPEC-V2 §3): four figures, one action, a short feed.
 * If a screen needs explanation, the screen is wrong.
 */

function pct(ratio: number | null): string {
  return ratio === null ? "—" : `${Math.round(ratio * 100)}%`;
}

function Stat({
  label,
  children,
  alert = false,
}: {
  label: string;
  children: React.ReactNode;
  alert?: boolean;
}) {
  return (
    <StaggerItem className="glass rounded-2xl p-5">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p
        className={cn(
          "mt-2 text-3xl font-semibold tracking-tight tabular sm:text-4xl",
          alert ? "text-destructive" : "glow text-primary",
        )}
      >
        {children}
      </p>
    </StaggerItem>
  );
}

export function DashboardView({
  stats,
  recentInvoices,
}: {
  stats: DashboardStats;
  recentInvoices: InvoiceListItem[];
}) {
  return (
    <div className="flex flex-col gap-8">
      <FadeUp className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
          <p className="text-sm text-muted-foreground">
            {new Date().toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>
        <Button render={<Link href="/invoices/upload" />} size="lg">
          Snap an invoice
        </Button>
      </FadeUp>

      <Stagger className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Spend this month">
          <CountUp value={stats.monthSpendCents} format={formatCents} />
        </Stat>
        <Stat label="Avg margin">{pct(stats.avgMarginRatio)}</Stat>
        <Stat label="Margin at risk" alert={stats.marginAtRiskCount > 0}>
          <CountUp value={stats.marginAtRiskCount} format={String} />
        </Stat>
        <Stat label="Costs went up" alert={stats.costUpCount > 0}>
          <CountUp value={stats.costUpCount} format={String} />
        </Stat>
      </Stagger>

      {stats.awaitingReview > 0 && (
        <FadeUp>
          <Link
            href="/invoices"
            className="glass flex items-center justify-between rounded-2xl border-primary/30 p-4 transition-colors hover:border-primary/60"
          >
            <span className="font-medium">
              {stats.awaitingReview} invoice
              {stats.awaitingReview === 1 ? "" : "s"} ready to review
            </span>
            <span className="text-primary">→</span>
          </Link>
        </FadeUp>
      )}

      <FadeUp className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Latest invoices</h2>
          <Link
            href="/invoices"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            All →
          </Link>
        </div>
        {recentInvoices.length === 0 ? (
          <div className="glass rounded-2xl p-8 text-center text-muted-foreground">
            Snap your first invoice — costs appear in seconds.
          </div>
        ) : (
          <Stagger className="flex flex-col gap-2">
            {recentInvoices.map((inv) => (
              <StaggerItem key={inv.id}>
                <Link
                  href={`/invoices/${inv.id}`}
                  className="glass flex items-center justify-between gap-3 rounded-xl p-4 transition-colors hover:border-primary/40"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {inv.vendor?.name ?? "Processing…"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {inv.line_count} lines
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="tabular text-sm">
                      {inv.total_cents != null ? formatCents(inv.total_cents) : ""}
                    </span>
                    <InvoiceStatusBadge status={inv.status} />
                  </div>
                </Link>
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </FadeUp>
    </div>
  );
}
