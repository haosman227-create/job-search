import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getServerEnv } from "@/lib/env";
import type { ClaudeUsage } from "@/lib/usage/cost";
import {
  extractionResultSchema,
  type ExtractionFile,
  type ExtractionResult,
} from "./schema";

// SPEC §8 pins extraction to claude-sonnet-5.
export const EXTRACTION_MODEL = "claude-sonnet-5";

export interface ExtractionCall {
  result: ExtractionResult;
  usage: ClaudeUsage;
}

const PROMPT = `Extract every invoice in the attached file(s) into the required JSON shape.

Rules:
- All money values are integer cents (e.g. $12.99 -> 1299). Never emit fractional cents.
- quantity may be fractional (e.g. 2.5 kg).
- Every confidence is your honest 0..1 estimate for that specific field; use low values freely.
- A multi-page document that continues one invoice is ONE invoice entry.
- If the file(s) contain multiple distinct invoices (different vendor / invoice-number blocks), emit one entry per invoice, in page order.
- Include every line item. If a line is visible but unreadable, set illegible=true, put whatever text you can make out in raw_text, set unreadable fields to null.
- invoice_date must be YYYY-MM-DD or null.
- barcode: only digits actually printed as a barcode number on the line; do not invent one.`;

function toContentBlock(file: ExtractionFile): Anthropic.ContentBlockParam {
  if (file.mediaType === "application/pdf") {
    return {
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: file.base64,
      },
    };
  }
  return {
    type: "image",
    source: {
      type: "base64",
      // Claude accepts jpeg/png/webp/gif; upload validation keeps us in range.
      media_type: file.mediaType as "image/jpeg" | "image/png" | "image/webp",
      data: file.base64,
    },
  };
}

/**
 * One vision call: files in, schema-validated extraction out. Structured
 * outputs guarantee the JSON parses; zod re-validates the numeric ranges the
 * API-side schema can't express (int cents, 0..1 confidence).
 */
export async function extractWithClaude(
  files: ExtractionFile[],
): Promise<ExtractionCall> {
  const client = new Anthropic({ apiKey: getServerEnv().ANTHROPIC_API_KEY });

  const response = await client.messages.parse({
    model: EXTRACTION_MODEL,
    max_tokens: 16000,
    output_config: { format: zodOutputFormat(extractionResultSchema) },
    messages: [
      {
        role: "user",
        content: [
          ...files.map(toContentBlock),
          { type: "text", text: PROMPT },
        ],
      },
    ],
  });

  if (response.stop_reason === "max_tokens") {
    throw new Error("Extraction output was truncated (max_tokens)");
  }
  if (!response.parsed_output) {
    throw new Error(
      `Extraction returned no parseable output (stop_reason: ${response.stop_reason})`,
    );
  }
  return {
    result: response.parsed_output,
    usage: {
      model: EXTRACTION_MODEL,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  };
}
