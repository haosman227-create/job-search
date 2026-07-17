import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveApiContext } from "@/lib/api/context";
import { ApiError, handleApiRoute } from "@/lib/api/errors";
import {
  getBusinessProfile,
  updateBusinessProfile,
} from "@/lib/api/services/settings";

const updateSchema = z.object({ name: z.string().trim().min(1, "Name is required") });

export const GET = handleApiRoute(async (request: Request) => {
  const ctx = await resolveApiContext(request);
  return NextResponse.json(await getBusinessProfile(ctx));
});

export const PATCH = handleApiRoute(async (request: Request) => {
  const ctx = await resolveApiContext(request);
  const body = updateSchema.parse(
    await request.json().catch(() => {
      throw new ApiError("validation_failed", "Body must be JSON.");
    }),
  );
  await updateBusinessProfile(ctx, body);
  return NextResponse.json({ ok: true });
});
