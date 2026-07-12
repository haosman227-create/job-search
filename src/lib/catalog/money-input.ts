import { assertCents } from "@/lib/domain";

/**
 * Conversions between the dollars users type and the integer cents we store.
 * Kept out of the component so they're unit-testable (money is never floated).
 */

/** Integer cents -> a dollars string for an input value ("" for null). */
export function centsToInput(cents: number | null): string {
  if (cents == null) return "";
  assertCents(cents);
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${(abs % 100).toString().padStart(2, "0")}`;
}

/**
 * A dollars string from an input -> integer cents. Empty/whitespace is null;
 * anything unparseable is null so a half-typed value doesn't submit garbage.
 */
export function inputToCents(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (!/^-?\d*(\.\d{0,2})?$/.test(trimmed)) return null;
  const negative = trimmed.startsWith("-");
  const [dollars = "0", cents = ""] = trimmed.replace("-", "").split(".");
  const total = Number(dollars) * 100 + Number(cents.padEnd(2, "0"));
  if (!Number.isFinite(total)) return null;
  return negative ? -total : total;
}

/** Quantity string -> number (null when empty/invalid). */
export function inputToQuantity(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
