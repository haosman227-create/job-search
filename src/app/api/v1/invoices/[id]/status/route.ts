import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveApiContext } from "@/lib/api/context";
import { handleApiRoute } from "@/lib/api/errors";
import { getInvoiceStatus } from "@/lib/api/services/invoices";

const paramsSchema = z.object({ id: z.uuid() });

/** Poll target while extraction runs (SPEC §5.2). */
export const GET = handleApiRoute(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const ctx = await resolveApiContext(request);
    const { id } = paramsSchema.parse(await params);
    return NextResponse.json(await getInvoiceStatus(ctx, id));
  },
);
