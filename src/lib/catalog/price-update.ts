import { computeSalePrice } from "@/lib/domain";

/**
 * Pure decisions behind the catalog inline-edit actions, so the recompute
 * rules (SPEC §4) are unit-testable without a database. The server actions
 * fetch the inputs, call these, and persist the returned fields.
 */

export interface OverrideUpdate {
  sale_price_override_cents: number | null;
  sale_price_cents?: number;
}

/**
 * Setting an override just marks it. Clearing it recomputes the standard
 * price from the current cost and department markup (when both are known).
 */
export function computeOverrideUpdate(params: {
  overrideCents: number | null;
  currentCostCents: number | null;
  targetMarkup: number | null;
}): OverrideUpdate {
  const update: OverrideUpdate = {
    sale_price_override_cents: params.overrideCents,
  };
  if (
    params.overrideCents == null &&
    params.currentCostCents != null &&
    params.targetMarkup != null
  ) {
    update.sale_price_cents = computeSalePrice(
      params.currentCostCents,
      params.targetMarkup,
    );
  }
  return update;
}

export interface DepartmentUpdate {
  department_id: string | null;
  department_confidence: null;
  sale_price_cents?: number;
}

/**
 * A manual department set is authoritative: confidence is nulled (clears the
 * low-confidence badge) and the computed price is refreshed for the new
 * markup — unless a manual sale-price override is in force.
 */
export function computeDepartmentUpdate(params: {
  departmentId: string | null;
  currentCostCents: number | null;
  targetMarkup: number | null;
  hasOverride: boolean;
}): DepartmentUpdate {
  const update: DepartmentUpdate = {
    department_id: params.departmentId,
    department_confidence: null,
  };
  if (
    params.departmentId != null &&
    params.currentCostCents != null &&
    params.targetMarkup != null &&
    !params.hasOverride
  ) {
    update.sale_price_cents = computeSalePrice(
      params.currentCostCents,
      params.targetMarkup,
    );
  }
  return update;
}
