import { NextResponse } from "next/server";
import { resolveApiContext } from "@/lib/api/context";
import { ApiError, handleApiRoute } from "@/lib/api/errors";
import { listInvoices, uploadInvoice } from "@/lib/api/services/invoices";

export const GET = handleApiRoute(async (request: Request) => {
  const ctx = await resolveApiContext(request);
  return NextResponse.json({ invoices: await listInvoices(ctx) });
});

/** Multipart upload: field "file" is the invoice photo or PDF. */
export const POST = handleApiRoute(async (request: Request) => {
  const ctx = await resolveApiContext(request);
  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    throw new ApiError("validation_failed", "Send the invoice as a 'file' form field.");
  }
  const result = await uploadInvoice(ctx, file);
  return NextResponse.json(result, { status: 201 });
});
