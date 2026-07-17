import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveApiContext } from "@/lib/api/context";
import { ApiError, handleApiRoute } from "@/lib/api/errors";
import { attachProductBarcode } from "@/lib/api/services/catalog";

const paramsSchema = z.object({ id: z.uuid() });
const bodySchema = z.object({ barcode: z.string().trim().min(1) });

/** Attach a barcode (SPEC §7.2); merges into a barcoded twin when one exists. */
export const POST = handleApiRoute(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const ctx = await resolveApiContext(request);
    const { id } = paramsSchema.parse(await params);
    const body = bodySchema.parse(
      await request.json().catch(() => {
        throw new ApiError("validation_failed", "Body must be JSON.");
      }),
    );
    const result = await attachProductBarcode(ctx, id, body.barcode);
    return NextResponse.json(result);
  },
);
