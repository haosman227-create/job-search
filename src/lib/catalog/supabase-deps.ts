import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeInvoiceNumber } from "@/lib/domain";
import type { ConfirmDeps, LineWrite } from "./confirm";
import { assignDepartmentsWithClaude } from "./departments-ai";

/**
 * Production binding of the confirm engine: the caller's RLS-scoped Supabase
 * client for all data access, Claude for department assignment.
 */
// The generic client type is fine here: table typing arrives with generated
// Supabase types; runtime shapes are pinned by the ConfirmDeps interface.
export function createConfirmDeps(supabase: SupabaseClient): ConfirmDeps {
  return {
    async loadInvoice(invoiceId) {
      const { data } = await supabase
        .from("invoice")
        .select("id, business_id, status")
        .eq("id", invoiceId)
        .maybeSingle();
      return data;
    },
    async upsertVendor(business_id, name, normalized_name) {
      const { data, error } = await supabase
        .from("vendor")
        .upsert(
          { business_id, name, normalized_name },
          { onConflict: "business_id,normalized_name" },
        )
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    async findDuplicateInvoice(params) {
      // Fetch same-vendor candidates and compare with the normalized
      // predicate so "INV-001" and "inv 001" collide (SPEC §7.1).
      const { data, error } = await supabase
        .from("invoice")
        .select("id, invoice_number, total_cents")
        .eq("business_id", params.businessId)
        .eq("vendor_id", params.vendorId)
        .eq("total_cents", params.totalCents)
        .in("status", ["confirmed", "partial"])
        .neq("id", params.excludeInvoiceId);
      if (error) throw error;
      const match = (data ?? []).find(
        (row: { invoice_number: string | null }) =>
          normalizeInvoiceNumber(row.invoice_number) === params.invoiceNumber,
      );
      return match?.id ?? null;
    },
    async getDepartments(businessId) {
      const { data, error } = await supabase
        .from("department")
        .select("id, name, target_markup")
        .eq("business_id", businessId);
      if (error) throw error;
      return (data ?? []).map(
        (d: { id: string; name: string; target_markup: string | number }) => ({
          id: d.id,
          name: d.name,
          target_markup: Number(d.target_markup),
        }),
      );
    },
    assignDepartments: assignDepartmentsWithClaude,
    async findProductByBarcode(businessId, barcode) {
      const { data } = await supabase
        .from("product")
        .select("id, department_id, current_cost_cents, sale_price_override_cents")
        .eq("business_id", businessId)
        .eq("barcode", barcode)
        .maybeSingle();
      return data;
    },
    async findProductByVendorName(businessId, vendorId, normalizedName) {
      const { data } = await supabase
        .from("product")
        .select("id, department_id, current_cost_cents, sale_price_override_cents")
        .eq("business_id", businessId)
        .eq("vendor_id", vendorId)
        .eq("normalized_name", normalizedName)
        .is("barcode", null)
        .maybeSingle();
      return data;
    },
    async insertProduct(product) {
      const { data, error } = await supabase
        .from("product")
        .insert(product)
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    async updateProductCost(productId, fields) {
      const { error } = await supabase
        .from("product")
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq("id", productId);
      if (error) throw error;
    },
    async replaceInvoiceLines(invoiceId, lines) {
      const { error: deleteError } = await supabase
        .from("invoice_line")
        .delete()
        .eq("invoice_id", invoiceId);
      if (deleteError) throw deleteError;
      // Strip the client-side line id: inserts get fresh ids.
      const inserts = lines.map((line: LineWrite) => {
        const { id, ...rest } = line;
        void id;
        return rest;
      });
      const { error } = await supabase.from("invoice_line").insert(inserts);
      if (error) throw error;
    },
    async updateInvoice(invoiceId, fields) {
      const { error } = await supabase
        .from("invoice")
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq("id", invoiceId);
      if (error) throw error;
    },
  };
}
