import { requireBusinessContext } from "@/lib/data/business";
import { getCatalog } from "@/lib/api/services/catalog";
import { RecipeForm } from "@/components/recipes/recipe-form";

export default async function NewRecipePage() {
  const ctx = await requireBusinessContext();
  const { rows } = await getCatalog(ctx);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">New recipe</h1>
      <RecipeForm
        products={rows.map((r) => ({
          id: r.id,
          name: r.name,
          costCents: r.costCents,
        }))}
      />
    </div>
  );
}
