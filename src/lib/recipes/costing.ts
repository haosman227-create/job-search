/**
 * Recipe costing (SPEC-V2 §5, V2-3). Pure: plate cost from live ingredient
 * costs, margin against the menu price. Because cost is recomputed from the
 * catalog on every read, an invoice that changes an ingredient's cost
 * re-costs every plate automatically — no sync job, no stale numbers.
 * Money integer cents; each ingredient line rounds once.
 */

export interface IngredientInput {
  productId: string;
  productName: string;
  quantity: number;
  /** Live catalog cost per unit; null when the product has no cost yet. */
  unitCostCents: number | null;
}

export interface CostedIngredient extends IngredientInput {
  /** round(quantity * unitCost); null when the cost is unknown. */
  lineCostCents: number | null;
}

export interface RecipeCost {
  ingredients: CostedIngredient[];
  /** Sum of known ingredient lines, integer cents. */
  plateCostCents: number;
  /** Ingredients missing a cost — the plate cost is partial until zero. */
  missingCostCount: number;
  /** (menu - plate) / menu; only when the cost is complete and menu > 0. */
  marginRatio: number | null;
  /** plate / menu as a ratio; same completeness rule. */
  costRatio: number | null;
}

export function costRecipe(
  ingredients: IngredientInput[],
  menuPriceCents: number | null,
): RecipeCost {
  const costed: CostedIngredient[] = ingredients.map((ing) => ({
    ...ing,
    lineCostCents:
      ing.unitCostCents === null
        ? null
        : Math.round(ing.quantity * ing.unitCostCents),
  }));

  const plateCostCents = costed.reduce(
    (sum, ing) => sum + (ing.lineCostCents ?? 0),
    0,
  );
  const missingCostCount = costed.filter((i) => i.lineCostCents === null).length;

  const complete =
    missingCostCount === 0 &&
    ingredients.length > 0 &&
    menuPriceCents !== null &&
    menuPriceCents > 0;

  return {
    ingredients: costed,
    plateCostCents,
    missingCostCount,
    marginRatio: complete
      ? (menuPriceCents - plateCostCents) / menuPriceCents
      : null,
    costRatio: complete ? plateCostCents / menuPriceCents : null,
  };
}
