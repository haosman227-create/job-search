import "server-only";
import { z } from "zod";
import { recordAudit } from "@/lib/audit/record";
import { costRecipe, type RecipeCost } from "@/lib/recipes/costing";
import type { ApiContext } from "../context";
import { ApiError } from "../errors";

/**
 * Recipe operations (V2-3) — single logic path for /api/v1 and the pages.
 * Boundary-scoped by ctx.businessId everywhere; the composite FKs in the
 * schema make cross-tenant ingredient references impossible even below us.
 * Plate costs are always computed from LIVE catalog costs at read time.
 */

export const recipeInputSchema = z.object({
  name: z.string().trim().min(1, "Give the recipe a name."),
  menuPriceCents: z.number().int().min(0).nullable(),
  ingredients: z
    .array(
      z.object({
        productId: z.uuid(),
        quantity: z.number().positive("Quantity must be positive."),
      }),
    )
    .min(1, "Add at least one ingredient."),
});
export type RecipeInput = z.infer<typeof recipeInputSchema>;

export interface RecipeSummary {
  id: string;
  name: string;
  menuPriceCents: number | null;
  cost: RecipeCost;
}

interface IngredientRow {
  product_id: string;
  quantity: string | number;
  product:
    | { name: string; current_cost_cents: number | null }
    | { name: string; current_cost_cents: number | null }[]
    | null;
}

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function toCost(rows: IngredientRow[], menuPriceCents: number | null): RecipeCost {
  return costRecipe(
    rows.map((row) => {
      const product = one(row.product);
      return {
        productId: row.product_id,
        productName: product?.name ?? "(deleted product)",
        quantity: Number(row.quantity),
        unitCostCents: product?.current_cost_cents ?? null,
      };
    }),
    menuPriceCents,
  );
}

const RECIPE_SELECT = `id, name, menu_price_cents,
  recipe_ingredient(product_id, quantity, product:product_id(name, current_cost_cents))`;

export async function listRecipes(ctx: ApiContext): Promise<RecipeSummary[]> {
  const { data } = await ctx.supabase
    .from("recipe")
    .select(RECIPE_SELECT)
    .eq("business_id", ctx.businessId)
    .order("name");

  return ((data ?? []) as unknown as {
    id: string;
    name: string;
    menu_price_cents: number | null;
    recipe_ingredient: IngredientRow[];
  }[]).map((r) => ({
    id: r.id,
    name: r.name,
    menuPriceCents: r.menu_price_cents,
    cost: toCost(r.recipe_ingredient ?? [], r.menu_price_cents),
  }));
}

export async function getRecipe(
  ctx: ApiContext,
  recipeId: string,
): Promise<RecipeSummary> {
  const { data } = await ctx.supabase
    .from("recipe")
    .select(RECIPE_SELECT)
    .eq("business_id", ctx.businessId)
    .eq("id", recipeId)
    .maybeSingle();
  if (!data) throw new ApiError("not_found", "Recipe not found.");
  const r = data as unknown as {
    id: string;
    name: string;
    menu_price_cents: number | null;
    recipe_ingredient: IngredientRow[];
  };
  return {
    id: r.id,
    name: r.name,
    menuPriceCents: r.menu_price_cents,
    cost: toCost(r.recipe_ingredient ?? [], r.menu_price_cents),
  };
}

/** Every referenced product must exist in the caller's tenant (404 otherwise). */
async function assertProductsOwned(
  ctx: ApiContext,
  productIds: string[],
): Promise<void> {
  const unique = [...new Set(productIds)];
  const { data } = await ctx.supabase
    .from("product")
    .select("id")
    .eq("business_id", ctx.businessId)
    .in("id", unique);
  if ((data ?? []).length !== unique.length) {
    throw new ApiError("not_found", "One or more ingredients were not found.");
  }
}

async function insertIngredients(
  ctx: ApiContext,
  recipeId: string,
  input: RecipeInput,
): Promise<void> {
  const { error } = await ctx.supabase.from("recipe_ingredient").insert(
    input.ingredients.map((ing) => ({
      business_id: ctx.businessId,
      recipe_id: recipeId,
      product_id: ing.productId,
      quantity: ing.quantity,
    })),
  );
  if (error) throw new ApiError("validation_failed", error.message);
}

export async function createRecipe(
  ctx: ApiContext,
  payload: unknown,
): Promise<{ id: string }> {
  const input = recipeInputSchema.parse(payload);
  await assertProductsOwned(ctx, input.ingredients.map((i) => i.productId));

  const { data, error } = await ctx.supabase
    .from("recipe")
    .insert({
      business_id: ctx.businessId,
      name: input.name,
      menu_price_cents: input.menuPriceCents,
    })
    .select("id")
    .single();
  if (error) throw new ApiError("validation_failed", error.message);

  await insertIngredients(ctx, data.id, input);
  await recordAudit({
    businessId: ctx.businessId,
    actorUserId: ctx.userId,
    action: "recipe.created",
    entityType: "recipe",
    entityId: data.id,
    metadata: { name: input.name },
  });
  return data;
}

export async function updateRecipe(
  ctx: ApiContext,
  recipeId: string,
  payload: unknown,
): Promise<void> {
  const input = recipeInputSchema.parse(payload);
  await getRecipe(ctx, recipeId); // 404 boundary check
  await assertProductsOwned(ctx, input.ingredients.map((i) => i.productId));

  const { error } = await ctx.supabase
    .from("recipe")
    .update({
      name: input.name,
      menu_price_cents: input.menuPriceCents,
      updated_at: new Date().toISOString(),
    })
    .eq("business_id", ctx.businessId)
    .eq("id", recipeId);
  if (error) throw new ApiError("validation_failed", error.message);

  // Ingredients are replaced wholesale — simplest correct semantics for a
  // small list the UI edits as one form.
  const { error: clearError } = await ctx.supabase
    .from("recipe_ingredient")
    .delete()
    .eq("business_id", ctx.businessId)
    .eq("recipe_id", recipeId);
  if (clearError) throw new ApiError("internal_error", clearError.message);
  await insertIngredients(ctx, recipeId, input);

  await recordAudit({
    businessId: ctx.businessId,
    actorUserId: ctx.userId,
    action: "recipe.updated",
    entityType: "recipe",
    entityId: recipeId,
    metadata: { name: input.name },
  });
}

export async function deleteRecipe(
  ctx: ApiContext,
  recipeId: string,
): Promise<void> {
  const existing = await getRecipe(ctx, recipeId);
  const { error } = await ctx.supabase
    .from("recipe")
    .delete()
    .eq("business_id", ctx.businessId)
    .eq("id", recipeId);
  if (error) throw new ApiError("internal_error", error.message);
  await recordAudit({
    businessId: ctx.businessId,
    actorUserId: ctx.userId,
    action: "recipe.deleted",
    entityType: "recipe",
    entityId: recipeId,
    metadata: { name: existing.name },
  });
}
