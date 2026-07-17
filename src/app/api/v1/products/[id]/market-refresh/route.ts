import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveApiContext } from "@/lib/api/context";
import { handleApiRoute } from "@/lib/api/errors";
import { refreshMarketPrice } from "@/lib/api/services/catalog";

const paramsSchema = z.object({ id: z.uuid() });

/** Manual AI market-price refresh (SPEC §4). */
export const POST = handleApiRoute(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const ctx = await resolveApiContext(request);
    const { id } = paramsSchema.parse(await params);
    await refreshMarketPrice(ctx, id);
    return NextResponse.json({ ok: true });
  },
);
