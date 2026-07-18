/**
 * Price intelligence (SPEC-V2 §5, V2-2) — the "pass MarginEdge" feature.
 * MarginEdge makes you dig through reports; this reads the cost history the
 * invoices already produced and tells the operator what moved, what it costs
 * them per month, and what it does to their margins — proactively.
 *
 * Pure: the service loads per-product cost observations and calls this.
 * Money is integer cents throughout; quantities may be fractional.
 */

import { formatCents } from "@/lib/domain";

/** One observed purchase of a product (an invoice line). */
export interface CostObservation {
  /** ISO timestamp of the invoice (creation or invoice date). */
  at: string;
  unitCostCents: number;
  quantity: number;
}

export interface ProductCostHistory {
  productId: string;
  name: string;
  /** Effective sale price (override wins), null when unpriced. */
  salePriceCents: number | null;
  /** Chronological observations, oldest first. */
  observations: CostObservation[];
}

export type InsightKind = "price_spike" | "price_drop" | "margin_squeeze";
export type InsightSeverity = "high" | "medium";

export interface Insight {
  kind: InsightKind;
  severity: InsightSeverity;
  productId: string;
  productName: string;
  previousCostCents: number;
  currentCostCents: number;
  /** Signed percent change, rounded to whole percent. */
  changePct: number;
  /** Signed monthly cost impact at recent volume, integer cents. */
  monthlyImpactCents: number;
  /** Margin ratio at the current cost, null when unpriced. */
  marginRatio: number | null;
  /** One human line, numbers-first, no jargon. */
  summary: string;
}

/** Ignore noise below this move (either direction). */
export const CHANGE_THRESHOLD_PCT = 5;
/** A move this big (or this costly) is high severity. */
export const HIGH_SEVERITY_PCT = 15;
export const HIGH_SEVERITY_IMPACT_CENTS = 10_000;
/** Margin below this after a cost move is a squeeze. */
export const SQUEEZE_MARGIN_RATIO = 0.15;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Units bought in the trailing 30 days; falls back to the latest line's qty. */
export function monthlyQuantity(
  observations: CostObservation[],
  now: string,
): number {
  const cutoff = Date.parse(now) - 30 * DAY_MS;
  const recent = observations.filter((o) => Date.parse(o.at) >= cutoff);
  if (recent.length > 0) {
    return recent.reduce((sum, o) => sum + o.quantity, 0);
  }
  return observations.at(-1)?.quantity ?? 0;
}

function marginRatioAt(
  salePriceCents: number | null,
  costCents: number,
): number | null {
  if (salePriceCents === null || salePriceCents <= 0) return null;
  return (salePriceCents - costCents) / salePriceCents;
}

function severityOf(pct: number, impactCents: number): InsightSeverity {
  return Math.abs(pct) >= HIGH_SEVERITY_PCT ||
    Math.abs(impactCents) >= HIGH_SEVERITY_IMPACT_CENTS
    ? "high"
    : "medium";
}

function summarize(insight: Omit<Insight, "summary">): string {
  const name = insight.productName;
  const pct = `${Math.abs(insight.changePct)}%`;
  const impact = formatCents(Math.abs(insight.monthlyImpactCents));
  switch (insight.kind) {
    case "price_spike":
      return `${name} up ${pct} — ${impact}/mo more at recent volume`;
    case "price_drop":
      return `${name} down ${pct} — ${impact}/mo back in your pocket`;
    case "margin_squeeze":
      return `${name} margin squeezed to ${Math.round((insight.marginRatio ?? 0) * 100)}% — reprice or renegotiate`;
  }
}

/**
 * Detect the latest meaningful cost move per product. The comparison is the
 * newest observation vs the most recent DIFFERENT cost before it, so repeated
 * deliveries at the same price don't bury a change.
 */
export function detectInsights(
  histories: ProductCostHistory[],
  now: string,
): Insight[] {
  const insights: Insight[] = [];

  for (const product of histories) {
    const obs = product.observations;
    if (obs.length < 2) continue;

    const latest = obs[obs.length - 1];
    const previous = [...obs.slice(0, -1)]
      .reverse()
      .find((o) => o.unitCostCents !== latest.unitCostCents);
    if (!previous || previous.unitCostCents <= 0) continue;

    const deltaCents = latest.unitCostCents - previous.unitCostCents;
    const changePct = Math.round((deltaCents / previous.unitCostCents) * 100);
    if (Math.abs(changePct) < CHANGE_THRESHOLD_PCT) continue;

    const monthlyImpactCents = Math.round(
      deltaCents * monthlyQuantity(obs, now),
    );
    const marginRatio = marginRatioAt(
      product.salePriceCents,
      latest.unitCostCents,
    );

    const base = {
      severity: severityOf(changePct, monthlyImpactCents),
      productId: product.productId,
      productName: product.name,
      previousCostCents: previous.unitCostCents,
      currentCostCents: latest.unitCostCents,
      changePct,
      monthlyImpactCents,
      marginRatio,
    };

    // A spike that also crushes the margin is reported as the squeeze — the
    // operator's action (reprice) matters more than the cause.
    const kind: InsightKind =
      deltaCents > 0 && marginRatio !== null && marginRatio < SQUEEZE_MARGIN_RATIO
        ? "margin_squeeze"
        : deltaCents > 0
          ? "price_spike"
          : "price_drop";

    const withKind = {
      ...base,
      kind,
      severity: kind === "margin_squeeze" ? ("high" as const) : base.severity,
    };
    insights.push({ ...withKind, summary: summarize(withKind) });
  }

  // Costliest problems first; savings after risks at equal impact.
  return insights.sort(
    (a, b) =>
      Math.abs(b.monthlyImpactCents) - Math.abs(a.monthlyImpactCents) ||
      (a.kind === "price_drop" ? 1 : 0) - (b.kind === "price_drop" ? 1 : 0),
  );
}

/** The weekly digest: a handful of lines an owner reads in ten seconds. */
export function buildDigest(
  insights: Insight[],
  now: string,
): { generatedAt: string; headline: string; lines: string[] } {
  const risks = insights.filter((i) => i.kind !== "price_drop");
  const totalRiskCents = risks.reduce(
    (sum, i) => sum + Math.abs(i.monthlyImpactCents),
    0,
  );
  const headline =
    insights.length === 0
      ? "Prices held steady this week."
      : risks.length === 0
        ? "Only good news: supplier prices moved your way."
        : `${risks.length} price ${risks.length === 1 ? "move needs" : "moves need"} attention — ${formatCents(totalRiskCents)}/mo at stake.`;

  return {
    generatedAt: now,
    headline,
    lines: insights.slice(0, 5).map((i) => i.summary),
  };
}
