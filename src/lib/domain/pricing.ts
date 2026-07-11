import { assertCents, multiplyCents } from "./money";

/**
 * Rounds a price to a "psychological" ending (SPEC §4): .99 for prices of a
 * dollar or more, a 9-cent ending below a dollar. Picks the nearest such
 * ending (ties round up); `floorCents` guards against rounding below cost —
 * when the nearest ending would drop under it, we step up to the next one.
 */
export function psychologicalRound(cents: number, floorCents = 0): number {
  assertCents(cents);
  assertCents(floorCents, "floorCents");
  if (cents <= 0) return 0;

  const step = cents < 100 ? 10 : 100;
  const ending = step - 1;
  // Nearest candidate ending in .99 (or .X9 under a dollar), ties upward.
  let candidate = Math.round((cents - ending) / step) * step + ending;
  if (candidate < ending) candidate = ending;
  while (candidate < floorCents) {
    candidate += step;
  }
  return candidate;
}

/**
 * The price the business charges (SPEC §4): cost × (1 + department markup),
 * rounded psychologically and never below cost so the target margin can't go
 * negative through rounding.
 */
export function computeSalePrice(
  costCents: number,
  targetMarkup: number,
): number {
  assertCents(costCents, "costCents");
  if (!Number.isFinite(targetMarkup) || targetMarkup < 0) {
    throw new TypeError(`targetMarkup must be >= 0, got ${targetMarkup}`);
  }
  if (costCents <= 0) return 0;
  const raw = multiplyCents(costCents, 1 + targetMarkup);
  return psychologicalRound(raw, costCents);
}

/**
 * What the catalog actually shows/charges: an explicit manual override wins
 * over the computed price until cleared (SPEC §4).
 */
export function effectiveSalePrice(product: {
  salePriceCents: number | null;
  salePriceOverrideCents: number | null;
}): number | null {
  return product.salePriceOverrideCents ?? product.salePriceCents;
}

/** True when the latest invoice raised the product's cost (SPEC §5.1 badge). */
export function costIncreased(product: {
  currentCostCents: number | null;
  previousCostCents: number | null;
}): boolean {
  return (
    product.currentCostCents != null &&
    product.previousCostCents != null &&
    product.currentCostCents > product.previousCostCents
  );
}

/**
 * Mispricing signal (SPEC §4): where the sale price sits relative to the AI
 * market estimate. Null when either price is unknown.
 */
export function marketComparison(
  salePriceCents: number | null,
  marketPriceCents: number | null,
): "above" | "below" | "at" | null {
  if (salePriceCents == null || marketPriceCents == null) return null;
  if (salePriceCents > marketPriceCents) return "above";
  if (salePriceCents < marketPriceCents) return "below";
  return "at";
}
