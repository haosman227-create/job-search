import { NextResponse } from "next/server";
import { resolveApiContext } from "@/lib/api/context";
import { handleApiRoute } from "@/lib/api/errors";
import {
  cancelAccountDeletion,
  requestAccountDeletion,
} from "@/lib/api/services/account";

/** Request account deletion — starts the grace period before hard delete. */
export const POST = handleApiRoute(async (request: Request) => {
  const ctx = await resolveApiContext(request);
  const deletion = await requestAccountDeletion(ctx);
  return NextResponse.json({ deletion });
});

/** Cancel a pending deletion within the grace period. */
export const DELETE = handleApiRoute(async (request: Request) => {
  const ctx = await resolveApiContext(request);
  await cancelAccountDeletion(ctx);
  return NextResponse.json({ ok: true });
});
