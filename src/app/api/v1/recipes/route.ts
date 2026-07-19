import { NextResponse } from "next/server";
import { resolveApiContext } from "@/lib/api/context";
import { handleApiRoute } from "@/lib/api/errors";
import { createRecipe, listRecipes } from "@/lib/api/services/recipes";

/** Menu items with live plate cost + margin (V2-3). */
export const GET = handleApiRoute(async (request: Request) => {
  const ctx = await resolveApiContext(request);
  return NextResponse.json({ recipes: await listRecipes(ctx) });
});

/** Create a recipe: { name, menuPriceCents, ingredients: [{productId, quantity}] } */
export const POST = handleApiRoute(async (request: Request) => {
  const ctx = await resolveApiContext(request);
  const result = await createRecipe(ctx, await request.json().catch(() => ({})));
  return NextResponse.json(result, { status: 201 });
});
