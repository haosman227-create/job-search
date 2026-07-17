import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveApiContext } from "@/lib/api/context";
import { ApiError, handleApiRoute } from "@/lib/api/errors";
import { deleteDepartment, updateDepartment } from "@/lib/api/services/settings";

const paramsSchema = z.object({ id: z.uuid() });

const updateSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  targetMarkup: z.number().min(0),
  displayOrder: z.number().int().min(0),
});

export const PATCH = handleApiRoute(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const ctx = await resolveApiContext(request);
    const { id } = paramsSchema.parse(await params);
    const body = updateSchema.parse(
      await request.json().catch(() => {
        throw new ApiError("validation_failed", "Body must be JSON.");
      }),
    );
    await updateDepartment(ctx, id, body);
    return NextResponse.json({ ok: true });
  },
);

export const DELETE = handleApiRoute(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const ctx = await resolveApiContext(request);
    const { id } = paramsSchema.parse(await params);
    await deleteDepartment(ctx, id);
    return NextResponse.json({ ok: true });
  },
);
