import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeBarcode } from "@/lib/domain";
import type { BarcodeAttachDeps, MergeLine } from "./merge";

/** Production binding of the barcode attach/merge engine to Supabase (RLS-scoped). */
export function createBarcodeAttachDeps(
  supabase: SupabaseClient,
): BarcodeAttachDeps {
  return {
    normalizeBarcode,
    async loadProduct(productId) {
      const { data } = await supabase
        .from("product")
        .select("id, business_id, barcode, department_id, sale_price_override_cents")
        .eq("id", productId)
        .maybeSingle();
      return data;
    },
    async findProductByBarcode(businessId, barcode) {
      const { data } = await supabase
        .from("product")
        .select("id, business_id, barcode, department_id, sale_price_override_cents")
        .eq("business_id", businessId)
        .eq("barcode", barcode)
        .maybeSingle();
      return data;
    },
    async getDepartmentMarkup(departmentId) {
      const { data } = await supabase
        .from("department")
        .select("target_markup")
        .eq("id", departmentId)
        .maybeSingle();
      return data?.target_markup != null ? Number(data.target_markup) : null;
    },
    async listLines(productId) {
      const { data } = await supabase
        .from("invoice_line")
        .select("unit_cost_cents, created_at, invoice:invoice_id(invoice_date)")
        .eq("product_id", productId);
      return ((data ?? []) as unknown as {
        unit_cost_cents: number | null;
        created_at: string;
        invoice: { invoice_date: string | null } | { invoice_date: string | null }[] | null;
      }[]).map((row): MergeLine => {
        const invoice = Array.isArray(row.invoice) ? row.invoice[0] : row.invoice;
        return {
          unit_cost_cents: row.unit_cost_cents,
          invoice_date: invoice?.invoice_date ?? null,
          created_at: row.created_at,
        };
      });
    },
    async setBarcode(productId, barcode) {
      const { error } = await supabase
        .from("product")
        .update({ barcode, updated_at: new Date().toISOString() })
        .eq("id", productId);
      if (error) throw error;
    },
    async repointLines(fromProductId, toProductId) {
      const { error } = await supabase
        .from("invoice_line")
        .update({ product_id: toProductId })
        .eq("product_id", fromProductId);
      if (error) throw error;
    },
    async updateCost(productId, cost) {
      const { error } = await supabase
        .from("product")
        .update({ ...cost, updated_at: new Date().toISOString() })
        .eq("id", productId);
      if (error) throw error;
    },
    async deleteProduct(productId) {
      const { error } = await supabase.from("product").delete().eq("id", productId);
      if (error) throw error;
    },
  };
}
