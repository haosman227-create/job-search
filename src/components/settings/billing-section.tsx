"use client";

import { useState } from "react";
import { apiJson } from "@/lib/api/client";
import { ApiClientError } from "@/lib/api/client";
import { formatCents } from "@/lib/domain";
import type { BillingView } from "@/lib/api/services/billing";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// One money formatter everywhere (integer cents in, string out — no floats).
function formatPrice(cents: number): string {
  return cents === 0 ? "Free" : formatCents(cents);
}

const PAID = new Set(["starter", "growth", "pro"]);

export function BillingSection({ view }: { view: BillingView }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function go(action: () => Promise<{ url: string }>, key: string) {
    setBusy(key);
    setError(null);
    try {
      const { url } = await action();
      window.location.assign(url);
    } catch (e) {
      setError(
        e instanceof ApiClientError
          ? e.message
          : "Something went wrong. Please try again.",
      );
      setBusy(null);
    }
  }

  const upgrade = (planId: string) =>
    go(
      () => apiJson<{ url: string }>("/api/v1/billing/checkout", "POST", { planId }),
      planId,
    );
  const manage = () =>
    go(() => apiJson<{ url: string }>("/api/v1/billing/portal", "POST"), "portal");

  return (
    <div className="flex flex-col gap-4">
      {!view.billingConfigured && (
        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          Billing isn&apos;t enabled in this environment yet. Plans are shown for
          reference.
        </p>
      )}
      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {view.plans
          .filter((p) => PAID.has(p.id))
          .map((plan) => {
            const current = plan.id === view.currentPlanId;
            return (
              <div
                key={plan.id}
                className={cn(
                  "flex flex-col gap-3 rounded-lg border p-4",
                  current && "border-primary ring-1 ring-primary/30",
                )}
              >
                <div>
                  <div className="flex items-baseline justify-between">
                    <h3 className="font-medium">{plan.name}</h3>
                    {current && (
                      <span className="text-xs font-medium text-primary">
                        Current
                      </span>
                    )}
                  </div>
                  <p className="text-2xl font-semibold tracking-tight">
                    {formatPrice(plan.priceCents)}
                    <span className="text-sm font-normal text-muted-foreground">
                      /mo
                    </span>
                  </p>
                </div>
                <ul className="flex-1 text-sm text-muted-foreground">
                  <li>{plan.monthlyInvoiceQuota.toLocaleString()} invoices / month</li>
                  <li>{plan.seatQuota === null ? "Unlimited" : plan.seatQuota} seats</li>
                </ul>
                <Button
                  onClick={() => upgrade(plan.id)}
                  disabled={current || busy !== null || !view.billingConfigured}
                  variant={current ? "outline" : "default"}
                  size="sm"
                >
                  {current ? "Current plan" : busy === plan.id ? "Starting…" : "Choose plan"}
                </Button>
              </div>
            );
          })}
      </div>

      {view.hasBillingAccount && (
        <div>
          <Button
            onClick={manage}
            disabled={busy !== null || !view.billingConfigured}
            variant="outline"
            size="sm"
          >
            {busy === "portal" ? "Opening…" : "Manage billing"}
          </Button>
        </div>
      )}
    </div>
  );
}
