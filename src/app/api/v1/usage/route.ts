import { NextResponse } from "next/server";
import { resolveApiContext } from "@/lib/api/context";
import { handleApiRoute } from "@/lib/api/errors";
import { getPlanUsage } from "@/lib/api/services/usage";

/** The caller's plan, this month's usage, and remaining quota (SPEC-SAAS §7). */
export const GET = handleApiRoute(async (request: Request) => {
  const ctx = await resolveApiContext(request);
  return NextResponse.json({ usage: await getPlanUsage(ctx) });
});
