import { NextResponse } from "next/server";
import { resolveApiContext } from "@/lib/api/context";
import { handleApiRoute } from "@/lib/api/errors";
import { getBusinessProfile } from "@/lib/api/services/settings";

/** Client bootstrap: who am I and which tenant am I in. */
export const GET = handleApiRoute(async (request: Request) => {
  const ctx = await resolveApiContext(request);
  const business = await getBusinessProfile(ctx);
  return NextResponse.json({
    userId: ctx.userId,
    business,
  });
});
