import { NextResponse } from "next/server";
import { resolveApiContext } from "@/lib/api/context";
import { handleApiRoute } from "@/lib/api/errors";
import { getInsights } from "@/lib/api/services/insights";

/** Ranked price-intelligence insights (spikes, drops, margin squeezes). */
export const GET = handleApiRoute(async (request: Request) => {
  const ctx = await resolveApiContext(request);
  return NextResponse.json({ insights: await getInsights(ctx) });
});
