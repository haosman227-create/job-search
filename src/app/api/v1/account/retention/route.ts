import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveApiContext } from "@/lib/api/context";
import { handleApiRoute } from "@/lib/api/errors";
import { updateImageRetention } from "@/lib/api/services/account";

// null = keep invoice images until account deletion.
const bodySchema = z.object({
  retentionDays: z.number().int().positive().nullable(),
});

/** Set the per-tenant invoice-image retention window (SPEC-SAAS §5). */
export const PATCH = handleApiRoute(async (request: Request) => {
  const ctx = await resolveApiContext(request);
  const { retentionDays } = bodySchema.parse(await request.json().catch(() => ({})));
  await updateImageRetention(ctx, retentionDays);
  return NextResponse.json({ ok: true });
});
