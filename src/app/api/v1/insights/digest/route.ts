import { NextResponse } from "next/server";
import { resolveApiContext } from "@/lib/api/context";
import { handleApiRoute } from "@/lib/api/errors";
import { getDigest } from "@/lib/api/services/insights";

/** The ten-second weekly digest: one headline + up to five lines. */
export const GET = handleApiRoute(async (request: Request) => {
  const ctx = await resolveApiContext(request);
  return NextResponse.json({ digest: await getDigest(ctx) });
});
