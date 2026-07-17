import { NextResponse } from "next/server";
import { resolveApiContext } from "@/lib/api/context";
import { handleApiRoute } from "@/lib/api/errors";
import { getOnboardingState } from "@/lib/api/services/onboarding";

/** First-run checklist + trial status for the dashboard / native client. */
export const GET = handleApiRoute(async (request: Request) => {
  const ctx = await resolveApiContext(request);
  return NextResponse.json(await getOnboardingState(ctx));
});
