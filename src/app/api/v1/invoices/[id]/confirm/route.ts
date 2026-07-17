import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveApiContext } from "@/lib/api/context";
import { ApiError, handleApiRoute } from "@/lib/api/errors";
import { confirmInvoiceForTenant } from "@/lib/api/services/invoices";

const paramsSchema = z.object({ id: z.uuid() });

/**
 * Review submission. Returns 200 on merge; 409 duplicate_invoice with the
 * existing invoice id when the duplicate guard fires (resend with
 * overrideDuplicate: true to import anyway); 409 invalid_state otherwise.
 */
export const POST = handleApiRoute(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const ctx = await resolveApiContext(request);
    const { id } = paramsSchema.parse(await params);
    const body = await request.json().catch(() => {
      throw new ApiError("validation_failed", "Body must be JSON.");
    });

    const result = await confirmInvoiceForTenant(ctx, {
      ...(body as Record<string, unknown>),
      invoiceId: id,
    });

    if (result.outcome === "duplicate") {
      throw new ApiError(
        "duplicate_invoice",
        "An invoice with the same vendor, number, and total already exists.",
        { existingInvoiceId: result.existingInvoiceId },
      );
    }
    if (result.outcome === "invalid") {
      throw new ApiError("invalid_state", result.message);
    }
    return NextResponse.json(result);
  },
);
