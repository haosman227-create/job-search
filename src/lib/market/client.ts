import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getServerEnv } from "@/lib/env";

// Same model tier as the rest of the app (SPEC §8).
export const MARKET_MODEL = "claude-sonnet-5";

const estimateSchema = z.object({
  // Typical retail price a shopper would pay, in integer cents.
  market_price_cents: z.int().min(0).nullable(),
  confidence: z.number().min(0).max(1),
});

export interface MarketEstimateInput {
  name: string;
  barcode: string | null;
  departmentName: string | null;
}

/**
 * LLM market-price estimate (SPEC §4): a benchmark of typical retail price
 * given product name, barcode, and category. A best-effort estimate, clearly
 * labeled in the UI; null when the model can't reasonably guess.
 */
export async function estimateMarketPrice(
  input: MarketEstimateInput,
): Promise<number | null> {
  const client = new Anthropic({ apiKey: getServerEnv().ANTHROPIC_API_KEY });

  const response = await client.messages.parse({
    model: MARKET_MODEL,
    max_tokens: 1000,
    output_config: { format: zodOutputFormat(estimateSchema) },
    messages: [
      {
        role: "user",
        content: `Estimate the typical retail price a shopper pays for this product in a US convenience/grocery store.

Product: ${input.name}
${input.barcode ? `Barcode: ${input.barcode}` : ""}
Category: ${input.departmentName ?? "unknown"}

Return market_price_cents as integer cents (e.g. $1.99 -> 199), or null if you cannot make a reasonable estimate. confidence is your honest 0..1 estimate.`,
      },
    ],
  });

  return response.parsed_output?.market_price_cents ?? null;
}
