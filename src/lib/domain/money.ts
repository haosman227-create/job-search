/**
 * Money is integer cents everywhere (CLAUDE.md). These helpers are the only
 * sanctioned way to do arithmetic on it — never use floats on money directly.
 */

export function assertCents(value: number, label = "amount"): number {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`${label} must be integer cents, got ${value}`);
  }
  return value;
}

/** Multiplies cents by a decimal rate, rounding half away from zero. */
export function multiplyCents(cents: number, rate: number): number {
  assertCents(cents);
  if (!Number.isFinite(rate)) {
    throw new TypeError(`rate must be finite, got ${rate}`);
  }
  return Math.round(cents * rate);
}

/**
 * Margin as a decimal fraction of the sale price (SPEC §4):
 * (sale − cost) / sale. Undefined (null) when there is no sale price to
 * divide by, or when either side is missing.
 */
export function margin(
  salePriceCents: number | null,
  costCents: number | null,
): number | null {
  if (salePriceCents == null || costCents == null || salePriceCents <= 0) {
    return null;
  }
  assertCents(salePriceCents, "salePriceCents");
  assertCents(costCents, "costCents");
  return (salePriceCents - costCents) / salePriceCents;
}

/** "$12.99" / "-$0.05" formatting for display. */
export function formatCents(cents: number): string {
  assertCents(cents);
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const remainder = (abs % 100).toString().padStart(2, "0");
  return `${sign}$${dollars}.${remainder}`;
}
