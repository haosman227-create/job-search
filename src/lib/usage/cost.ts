/**
 * Per-model token pricing for cost attribution (SPEC-SAAS §9.2). Rates are
 * micro-USD (millionths of a dollar) per token, so cost is exact integer math
 * — money is never a float. These are list rates; adjust here if pricing
 * changes or an intro rate applies.
 */

export interface ClaudeUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
}

interface Rate {
  /** micro-USD per input token */
  input: number;
  /** micro-USD per output token */
  output: number;
}

// claude-sonnet-5 list price: $3 / MTok input, $15 / MTok output.
//   $3 per 1,000,000 tokens = 3 micro-USD per token.
const RATES: Record<string, Rate> = {
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

// Fall back to the model we actually call so an unknown id never records $0.
const FALLBACK: Rate = RATES["claude-sonnet-5"];

export function rateForModel(model: string): Rate {
  return RATES[model] ?? FALLBACK;
}

/** Integer micro-USD cost of a Claude call. */
export function computeCostMicroUsd(usage: ClaudeUsage): number {
  const rate = rateForModel(usage.model);
  return usage.inputTokens * rate.input + usage.outputTokens * rate.output;
}

/** Micro-USD -> a "$0.0123" display string (never floats the stored value). */
export function formatMicroUsd(micro: number): string {
  const sign = micro < 0 ? "-" : "";
  const abs = Math.abs(micro);
  const dollars = Math.floor(abs / 1_000_000);
  const frac = (abs % 1_000_000).toString().padStart(6, "0").replace(/0+$/, "");
  return `${sign}$${dollars}${frac ? "." + frac : ".00"}`;
}
