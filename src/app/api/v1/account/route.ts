import { NextResponse } from "next/server";
import { resolveApiContext } from "@/lib/api/context";
import { handleApiRoute } from "@/lib/api/errors";
import { getDataRights } from "@/lib/api/services/account";

/** Data-rights status: pending deletion (with days left) + image retention. */
export const GET = handleApiRoute(async (request: Request) => {
  const ctx = await resolveApiContext(request);
  return NextResponse.json(await getDataRights(ctx));
});
