/**
 * When to (re)fetch a product's AI market-price estimate (SPEC §4, PLAN
 * Phase 9). The estimate is cached per product; it is refreshed only on a
 * material cost change or an explicit manual refresh — never on a schedule.
 */

/** A cost move at or above this fraction is "material" enough to re-estimate. */
export const MATERIAL_COST_CHANGE_RATIO = 0.1; // 10%

export interface RefreshInputs {
  marketPriceCents: number | null;
  marketPriceFetchedAt: string | null;
  previousCostCents: number | null;
  currentCostCents: number | null;
  manual: boolean;
}

export function shouldRefreshMarketPrice(inputs: RefreshInputs): boolean {
  // A manual refresh always re-estimates.
  if (inputs.manual) return true;

  // Never estimated yet: fetch once we have something to price on.
  if (inputs.marketPriceCents == null || inputs.marketPriceFetchedAt == null) {
    return inputs.currentCostCents != null;
  }

  // Already have an estimate; only a material cost change justifies redoing it.
  if (inputs.currentCostCents == null || inputs.previousCostCents == null) {
    return false;
  }
  if (inputs.previousCostCents === 0) {
    return inputs.currentCostCents !== 0;
  }
  const ratio =
    Math.abs(inputs.currentCostCents - inputs.previousCostCents) /
    inputs.previousCostCents;
  return ratio >= MATERIAL_COST_CHANGE_RATIO;
}
