import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveApiContext } from "@/lib/api/context";
import { handleApiRoute } from "@/lib/api/errors";
import {
  deleteRecipe,
  getRecipe,
  updateRecipe,
} from "@/lib/api/services/recipes";

const paramsSchema = z.object({ id: z.uuid() });

type Ctx = { params: Promise<{ id: string }> };

export const GET = handleApiRoute(async (request: Request, { params }: Ctx) => {
  const ctx = await resolveApiContext(request);
  const { id } = paramsSchema.parse(await params);
  return NextResponse.json({ recipe: await getRecipe(ctx, id) });
});

export const PATCH = handleApiRoute(async (request: Request, { params }: Ctx) => {
  const ctx = await resolveApiContext(request);
  const { id } = paramsSchema.parse(await params);
  await updateRecipe(ctx, id, await request.json().catch(() => ({})));
  return NextResponse.json({ ok: true });
});

export const DELETE = handleApiRoute(async (request: Request, { params }: Ctx) => {
  const ctx = await resolveApiContext(request);
  const { id } = paramsSchema.parse(await params);
  await deleteRecipe(ctx, id);
  return NextResponse.json({ ok: true });
});
