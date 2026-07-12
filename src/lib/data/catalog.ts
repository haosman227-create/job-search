import "server-only";
import { requireBusinessContext } from "./business";
import { buildCatalogRow, type CatalogProduct, type CatalogRow } from "@/lib/catalog/row";

export interface CatalogData {
  rows: CatalogRow[];
  departments: { id: string; name: string }[];
  vendors: { id: string; name: string }[];
}

interface ProductJoin {
  id: string;
  barcode: string | null;
  name: string;
  vendor_id: string | null;
  department_id: string | null;
  department_confidence: number | null;
  current_cost_cents: number | null;
  previous_cost_cents: number | null;
  market_price_cents: number | null;
  sale_price_cents: number | null;
  sale_price_override_cents: number | null;
  vendor: { name: string } | null;
  department: { name: string } | null;
}

/** Loads the catalog rows plus the filter option lists for the current business. */
export async function loadCatalog(): Promise<CatalogData> {
  const { supabase } = await requireBusinessContext();

  const [{ data: products }, { data: departments }, { data: vendors }] =
    await Promise.all([
      supabase
        .from("product")
        .select(
          `id, barcode, name, vendor_id, department_id, department_confidence,
           current_cost_cents, previous_cost_cents, market_price_cents,
           sale_price_cents, sale_price_override_cents,
           vendor:vendor_id(name), department:department_id(name)`,
        )
        .eq("archived", false),
      supabase.from("department").select("id, name").order("display_order"),
      supabase.from("vendor").select("id, name").order("name"),
    ]);

  const rows = ((products ?? []) as unknown as ProductJoin[]).map((p) => {
    const catalogProduct: CatalogProduct = {
      id: p.id,
      barcode: p.barcode,
      name: p.name,
      vendor_id: p.vendor_id,
      vendor_name: p.vendor?.name ?? null,
      department_id: p.department_id,
      department_name: p.department?.name ?? null,
      department_confidence: p.department_confidence,
      current_cost_cents: p.current_cost_cents,
      previous_cost_cents: p.previous_cost_cents,
      market_price_cents: p.market_price_cents,
      sale_price_cents: p.sale_price_cents,
      sale_price_override_cents: p.sale_price_override_cents,
    };
    return buildCatalogRow(catalogProduct);
  });

  return {
    rows,
    departments: (departments ?? []) as { id: string; name: string }[],
    vendors: (vendors ?? []) as { id: string; name: string }[],
  };
}
