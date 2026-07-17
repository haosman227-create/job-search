import { NextResponse } from "next/server";
import { resolveApiContext } from "@/lib/api/context";
import { handleApiRoute } from "@/lib/api/errors";
import { getCatalog } from "@/lib/api/services/catalog";

export const GET = handleApiRoute(async (request: Request) => {
  const ctx = await resolveApiContext(request);
  return NextResponse.json(await getCatalog(ctx));
});
