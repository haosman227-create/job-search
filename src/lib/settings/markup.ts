/**
 * Department markup is stored as a decimal fraction (0.30 = 30%) but shown and
 * edited as a percent. These conversions keep the UI honest; markup feeds the
 * sale-price math so a bad parse must fail closed (null), never guess.
 */

/** Decimal fraction -> percent string for an input ("30", "12.5"). */
export function markupToPercent(markup: number): string {
  const percent = markup * 100;
  // Trim trailing zeros: 0.30 -> "30", 0.125 -> "12.5".
  return String(Number(percent.toFixed(2)));
}

/** Percent string from an input -> decimal fraction, or null when invalid. */
export function percentToMarkup(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "" || !/^\d*(\.\d+)?$/.test(trimmed)) return null;
  const percent = Number(trimmed);
  if (!Number.isFinite(percent) || percent < 0) return null;
  // Store to 4 decimal places (schema is numeric(6,4)).
  return Number((percent / 100).toFixed(4));
}
