import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveApiContext } from "@/lib/api/context";
import { ApiError, handleApiRoute } from "@/lib/api/errors";
import { createDepartment, listDepartments } from "@/lib/api/services/settings";

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  targetMarkup: z.number().min(0),
});

export const GET = handleApiRoute(async (request: Request) => {
  const ctx = await resolveApiContext(request);
  return NextResponse.json({ departments: await listDepartments(ctx) });
});

export const POST = handleApiRoute(async (request: Request) => {
  const ctx = await resolveApiContext(request);
  const body = createSchema.parse(
    await request.json().catch(() => {
      throw new ApiError("validation_failed", "Body must be JSON.");
    }),
  );
  const created = await createDepartment(ctx, body);
  return NextResponse.json(created, { status: 201 });
});
