import { NextResponse } from "next/server";
import { resolveApiContext } from "@/lib/api/context";
import { handleApiRoute } from "@/lib/api/errors";
import { createPortalSession } from "@/lib/api/services/billing";
import { appBaseUrl } from "@/lib/billing/config";

/** Open the Stripe Billing Portal so a customer can manage their subscription. */
export const POST = handleApiRoute(async (request: Request) => {
  const ctx = await resolveApiContext(request);
  const result = await createPortalSession(ctx, appBaseUrl(request));
  return NextResponse.json(result);
});
