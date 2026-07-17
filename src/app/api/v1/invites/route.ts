import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveApiContext } from "@/lib/api/context";
import { ApiError, handleApiRoute } from "@/lib/api/errors";
import { inviteUser } from "@/lib/api/services/settings";

const bodySchema = z.object({ email: z.email("Enter a valid email") });

/** Invite a teammate into the caller's workspace (SPEC §5.4). */
export const POST = handleApiRoute(async (request: Request) => {
  const ctx = await resolveApiContext(request);
  const body = bodySchema.parse(
    await request.json().catch(() => {
      throw new ApiError("validation_failed", "Body must be JSON.");
    }),
  );
  await inviteUser(ctx, body.email);
  return NextResponse.json({ ok: true }, { status: 201 });
});
