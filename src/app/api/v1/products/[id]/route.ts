import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveApiContext } from "@/lib/api/context";
import { ApiError, handleApiRoute } from "@/lib/api/errors";
import {
  setProductDepartment,
  setSalePriceOverride,
} from "@/lib/api/services/catalog";

const paramsSchema = z.object({ id: z.uuid() });

const patchSchema = z
  .object({
    // Present => set/clear the manual override (null clears).
    salePriceOverrideCents: z.int().min(0).nullable().optional(),
    // Present => set/clear the department (null clears).
    departmentId: z.uuid().nullable().optional(),
  })
  .refine(
    (body) =>
      body.salePriceOverrideCents !== undefined ||
      body.departmentId !== undefined,
    { message: "Provide salePriceOverrideCents and/or departmentId." },
  );

export const PATCH = handleApiRoute(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const ctx = await resolveApiContext(request);
    const { id } = paramsSchema.parse(await params);
    const body = patchSchema.parse(
      await request.json().catch(() => {
        throw new ApiError("validation_failed", "Body must be JSON.");
      }),
    );

    if (body.salePriceOverrideCents !== undefined) {
      await setSalePriceOverride(ctx, id, body.salePriceOverrideCents);
    }
    if (body.departmentId !== undefined) {
      await setProductDepartment(ctx, id, body.departmentId);
    }
    return NextResponse.json({ ok: true });
  },
);
