import { notFound } from "next/navigation";
import { requireBusinessContext } from "@/lib/data/business";
import { getCatalog } from "@/lib/api/services/catalog";
import { getRecipe } from "@/lib/api/services/recipes";
import { ApiError } from "@/lib/api/errors";
import { RecipeForm } from "@/components/recipes/recipe-form";

export default async function EditRecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireBusinessContext();
  const { id } = await params;

  let recipe;
  try {
    recipe = await getRecipe(ctx, id);
  } catch (error) {
    if (error instanceof ApiError && error.code === "not_found") notFound();
    throw error;
  }

  const { rows } = await getCatalog(ctx);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{recipe.name}</h1>
      <RecipeForm
        products={rows.map((r) => ({
          id: r.id,
          name: r.name,
          costCents: r.costCents,
        }))}
        initial={{
          id: recipe.id,
          name: recipe.name,
          menuPrice:
            recipe.menuPriceCents != null
              ? (recipe.menuPriceCents / 100).toFixed(2)
              : "",
          rows: recipe.cost.ingredients.map((ing) => ({
            productId: ing.productId,
            quantity: String(ing.quantity),
          })),
        }}
      />
    </div>
  );
}
