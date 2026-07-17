import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveApiContext } from "@/lib/api/context";
import { handleApiRoute } from "@/lib/api/errors";
import { createCheckoutSession } from "@/lib/api/services/billing";
import { appBaseUrl } from "@/lib/billing/config";

const bodySchema = z.object({
  planId: z.enum(["starter", "growth", "pro"]),
});

/** Start a Stripe Checkout session for a paid plan; returns the hosted URL. */
export const POST = handleApiRoute(async (request: Request) => {
  const ctx = await resolveApiContext(request);
  const { planId } = bodySchema.parse(await request.json().catch(() => ({})));
  const result = await createCheckoutSession(ctx, planId, appBaseUrl(request));
  return NextResponse.json(result);
});
