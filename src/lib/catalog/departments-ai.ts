import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getServerEnv } from "@/lib/env";
import type { DepartmentAssignment, DepartmentRecord } from "./confirm";

// Same model tier as extraction (SPEC §8).
const DEPARTMENT_MODEL = "claude-sonnet-5";

const assignmentResponseSchema = z.object({
  assignments: z.array(
    z.object({
      product_name: z.string(),
      department_name: z
        .string()
        .nullable()
        .describe("Exactly one of the provided department names, or null"),
      confidence: z.number().min(0).max(1),
    }),
  ),
});

/**
 * Batch department assignment for new products (SPEC §3 step 4: fully
 * automatic, low-confidence flagged in the catalog). Returns one assignment
 * per input name, in order; unknown/failed assignments come back null so the
 * product lands without a department rather than blocking the confirm.
 */
export async function assignDepartmentsWithClaude(
  productNames: string[],
  departments: DepartmentRecord[],
): Promise<DepartmentAssignment[]> {
  if (productNames.length === 0) return [];
  const byName = new Map(departments.map((d) => [d.name.toLowerCase(), d]));

  try {
    const client = new Anthropic({ apiKey: getServerEnv().ANTHROPIC_API_KEY });
    const response = await client.messages.parse({
      model: DEPARTMENT_MODEL,
      max_tokens: 4000,
      output_config: { format: zodOutputFormat(assignmentResponseSchema) },
      messages: [
        {
          role: "user",
          content: `Assign each retail product to the best-fitting department.

Departments: ${departments.map((d) => d.name).join(", ")}

Products:
${productNames.map((name, i) => `${i + 1}. ${name}`).join("\n")}

Return one assignment per product, in the same order. department_name must be exactly one of the department names above (or null if none fits). confidence is your honest 0..1 estimate.`,
        },
      ],
    });

    const assignments = response.parsed_output?.assignments ?? [];
    return productNames.map((_, index) => {
      const assignment = assignments[index];
      const department = assignment?.department_name
        ? byName.get(assignment.department_name.toLowerCase())
        : undefined;
      return department
        ? { department_id: department.id, confidence: assignment.confidence }
        : { department_id: null, confidence: 0 };
    });
  } catch {
    // Department assignment is best-effort: a model failure should never
    // block the confirm. Products land unassigned and editable inline.
    return productNames.map(() => ({ department_id: null, confidence: 0 }));
  }
}
