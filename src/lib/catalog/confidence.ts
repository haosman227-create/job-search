/**
 * Confidence thresholds for the UI. Low-confidence AI values must be visually
 * distinguished (CLAUDE.md); the review screen highlights fields below the
 * warn threshold so the user's eye goes to what needs checking.
 */
export const CONFIDENCE_WARN_THRESHOLD = 0.7;

export function isLowConfidence(value: number | null | undefined): boolean {
  return value != null && value < CONFIDENCE_WARN_THRESHOLD;
}

/** Reads a per-field confidence out of the stored jsonb map. */
export function fieldConfidence(
  confidence: Record<string, number> | null | undefined,
  field: string,
): number | null {
  const value = confidence?.[field];
  return typeof value === "number" ? value : null;
}
