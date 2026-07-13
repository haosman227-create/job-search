"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { runExtractionForInvoice } from "@/lib/extraction/runner";
import { confirmInvoice, type ConfirmResult } from "@/lib/catalog/confirm";
import { confirmInvoiceSchema } from "@/lib/catalog/confirm-schema";
import { createConfirmDeps } from "@/lib/catalog/supabase-deps";
import { refreshMarketPricesForProducts } from "@/lib/market/refresh";
import { requireBusinessContext } from "@/lib/data/business";
import {
  INVOICES_BUCKET,
  performInvoiceUpload,
  type InvoiceUploadClient,
} from "@/lib/invoices/upload";

export async function uploadInvoice(formData: FormData): Promise<void> {
  const { supabase, businessId, userId } = await requireBusinessContext();

  const file = formData.get("file");
  if (!(file instanceof File)) {
    redirect("/invoices/upload?error=" + encodeURIComponent("Choose a file to upload."));
  }

  const client: InvoiceUploadClient = {
    async createInvoice(business_id, uploaded_by) {
      const { data, error } = await supabase
        .from("invoice")
        .insert({ business_id, uploaded_by, status: "processing" })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    async uploadFile(path, upload) {
      const { error } = await supabase.storage
        .from(INVOICES_BUCKET)
        .upload(path, upload, { contentType: upload.type });
      if (error) throw error;
    },
    async setFilePaths(invoiceId, paths) {
      const { error } = await supabase
        .from("invoice")
        .update({ file_paths: paths })
        .eq("id", invoiceId);
      if (error) throw error;
    },
    async deleteInvoice(invoiceId) {
      await supabase.from("invoice").delete().eq("id", invoiceId);
    },
  };

  const result = await performInvoiceUpload(client, { businessId, userId, file });

  if (!result.ok) {
    redirect(
      "/invoices/upload?error=" +
        encodeURIComponent(result.error ?? "Upload failed."),
    );
  }

  // Extraction can take tens of seconds (SPEC §5.2): run it after the
  // response is sent; the detail page polls the invoice status meanwhile.
  const invoiceId = result.invoiceId;
  if (invoiceId) {
    after(() =>
      runExtractionForInvoice(invoiceId).catch((error) => {
        console.error(`extraction failed for invoice ${invoiceId}`, error);
      }),
    );
  }

  revalidatePath("/invoices");
  redirect(`/invoices/${result.invoiceId}`);
}

/**
 * Confirm reviewed lines into the catalog (SPEC §3 steps 3-4). Returns the
 * duplicate warning instead of throwing so the review UI (Phase 7) can show
 * the explicit-override dialog.
 */
export async function confirmInvoiceAction(
  payload: unknown,
): Promise<ConfirmResult> {
  const parsed = confirmInvoiceSchema.safeParse(payload);
  if (!parsed.success) {
    return { outcome: "invalid", message: parsed.error.issues[0].message };
  }

  const { supabase } = await requireBusinessContext();
  const result = await confirmInvoice(createConfirmDeps(supabase), parsed.data);

  if (result.outcome === "confirmed") {
    // Market estimates for new / materially-changed products, in the
    // background so confirm stays fast (the refresh policy skips the rest).
    if (result.productIds.length > 0) {
      after(() =>
        refreshMarketPricesForProducts(supabase, result.productIds).catch(
          (error) => console.error("market refresh after confirm failed", error),
        ),
      );
    }
    revalidatePath("/invoices");
    revalidatePath(`/invoices/${parsed.data.invoiceId}`);
    revalidatePath("/");
  }
  return result;
}
