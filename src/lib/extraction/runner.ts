import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { INVOICES_BUCKET } from "@/lib/invoices/upload";
import { recordUsage } from "@/lib/usage/record";
import { EXTRACTION_MODEL, extractWithClaude } from "./client";
import {
  runExtractionJob,
  type ExtractionJobDeps,
  type ExtractionJobResult,
} from "./job";

const EXTENSION_MEDIA_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
};

/** Binds the pure extraction job to Supabase + the Claude API. */
export async function runExtractionForInvoice(
  invoiceId: string,
): Promise<ExtractionJobResult> {
  const supabase = createAdminClient();

  const deps: ExtractionJobDeps = {
    async loadInvoice(id) {
      const { data } = await supabase
        .from("invoice")
        .select("id, business_id, status, file_paths, uploaded_by")
        .eq("id", id)
        .maybeSingle();
      return data;
    },
    async downloadFile(path) {
      const { data, error } = await supabase.storage
        .from(INVOICES_BUCKET)
        .download(path);
      if (error || !data) {
        throw error ?? new Error(`Missing file ${path}`);
      }
      const extension = path.split(".").pop()?.toLowerCase() ?? "";
      return {
        mediaType:
          data.type || EXTENSION_MEDIA_TYPES[extension] || "image/jpeg",
        base64: Buffer.from(await data.arrayBuffer()).toString("base64"),
      };
    },
    extract: extractWithClaude,
    async recordUsage(record) {
      await recordUsage({
        businessId: record.businessId,
        userId: record.userId,
        operation: "extraction",
        usage: record.usage,
        invoiceId: record.invoiceId,
        invoices: record.invoices,
        lineItems: record.lineItems,
        storageBytes: record.storageBytes,
      });
    },
    async upsertVendor(businessId, name, normalizedName) {
      const { data, error } = await supabase
        .from("vendor")
        .upsert(
          { business_id: businessId, name, normalized_name: normalizedName },
          { onConflict: "business_id,normalized_name", ignoreDuplicates: false },
        )
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    async updateInvoice(id, fields) {
      const { error } = await supabase.from("invoice").update(fields).eq("id", id);
      if (error) throw error;
    },
    async createInvoice(fields) {
      const { data, error } = await supabase
        .from("invoice")
        .insert({ ...fields, status: "processing" })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    async insertLines(lines) {
      const { error } = await supabase.from("invoice_line").insert(lines);
      if (error) throw error;
    },
    async markFailed(id) {
      await supabase.from("invoice").update({ status: "failed" }).eq("id", id);
    },
  };

  return runExtractionJob(deps, invoiceId, EXTRACTION_MODEL);
}
