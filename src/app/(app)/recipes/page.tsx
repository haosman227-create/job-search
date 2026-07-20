import Link from "next/link";
import { requireBusinessContext } from "@/lib/data/business";
import { listRecipes } from "@/lib/api/services/recipes";
import { formatCents } from "@/lib/domain";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function pct(ratio: number | null): string {
  return ratio === null ? "—" : `${Math.round(ratio * 100)}%`;
}

export default async function RecipesPage() {
  const ctx = await requireBusinessContext();
  const recipes = await listRecipes(ctx);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Recipes</h1>
        <Button render={<Link href="/recipes/new" />}>New recipe</Button>
      </div>

      {recipes.length === 0 ? (
        <div className="surface rounded-2xl p-10 text-center text-muted-foreground">
          Build a menu item from your catalog — its plate cost re-costs itself
          every time an invoice moves an ingredient price.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {recipes.map((recipe) => {
            const squeezed =
              recipe.cost.marginRatio !== null && recipe.cost.marginRatio < 0.6;
            return (
              <Link
                key={recipe.id}
                href={`/recipes/${recipe.id}`}
                className="surface flex flex-col gap-3 rounded-2xl p-5 transition-colors hover:border-primary/40"
              >
                <p className="font-medium">{recipe.name}</p>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">
                      Plate cost
                    </p>
                    <p className="tabular text-2xl font-semibold">
                      {formatCents(recipe.cost.plateCostCents)}
                      {recipe.cost.missingCostCount > 0 && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          partial
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground uppercase">
                      Margin
                    </p>
                    <p
                      className={cn(
                        "tabular text-2xl font-semibold",
                        recipe.cost.marginRatio === null
                          ? "text-muted-foreground"
                          : squeezed
                            ? "text-destructive"
                            : "text-positive",
                      )}
                    >
                      {pct(recipe.cost.marginRatio)}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Menu{" "}
                  {recipe.menuPriceCents != null
                    ? formatCents(recipe.menuPriceCents)
                    : "not set"}
                  {" · "}
                  {recipe.cost.ingredients.length} ingredient
                  {recipe.cost.ingredients.length === 1 ? "" : "s"}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
