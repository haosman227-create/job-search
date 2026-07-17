import { NextResponse } from "next/server";
import { resolveApiContext } from "@/lib/api/context";
import { ApiError, handleApiRoute } from "@/lib/api/errors";
import { listInvoices, uploadInvoice } from "@/lib/api/services/invoices";
import { withIdempotency } from "@/lib/guardrails/idempotency";

export const GET = handleApiRoute(async (request: Request) => {
  const ctx = await resolveApiContext(request);
  return NextResponse.json({ invoices: await listInvoices(ctx) });
});

/**
 * Multipart upload: field "file" is the invoice photo or PDF. An optional
 * `Idempotency-Key` header makes a retried upload return the first result
 * instead of extracting — and paying — twice (SPEC-SAAS §9.3).
 */
export const POST = handleApiRoute(async (request: Request) => {
  const ctx = await resolveApiContext(request);
  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    throw new ApiError("validation_failed", "Send the invoice as a 'file' form field.");
  }

  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (idempotencyKey) {
    const { result } = await withIdempotency(
      ctx.businessId,
      idempotencyKey,
      "invoice_upload",
      () => uploadInvoice(ctx, file),
    );
    return NextResponse.json(result, { status: 201 });
  }

  const result = await uploadInvoice(ctx, file);
  return NextResponse.json(result, { status: 201 });
});
