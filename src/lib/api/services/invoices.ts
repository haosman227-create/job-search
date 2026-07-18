import "server-only";
import { after } from "next/server";
import {
  INVOICES_BUCKET,
  performInvoiceUpload,
  type InvoiceUploadClient,
} from "@/lib/invoices/upload";
import { runExtractionForInvoice } from "@/lib/extraction/runner";
import { confirmInvoice, type ConfirmResult } from "@/lib/catalog/confirm";
import { confirmInvoiceSchema } from "@/lib/catalog/confirm-schema";
import { createConfirmDeps } from "@/lib/catalog/supabase-deps";
import { refreshMarketPricesForProducts } from "@/lib/market/refresh";
import { recordAudit } from "@/lib/audit/record";
import { logger } from "@/lib/log/logger";
import { assertClaudeGuardrail } from "@/lib/guardrails/enforce";
import {
  assertWithinRateLimit,
  UPLOAD_RATE_LIMIT,
} from "@/lib/guardrails/rate-limit";
import type { InvoiceLineRow, InvoiceListItem, InvoiceRow, VendorRow } from "@/lib/types";
import type { ApiContext } from "../context";
import { ApiError } from "../errors";

/**
 * Invoice operations — the single logic path shared by the /api/v1 routes and
 * the server-rendered pages. Every query filters by ctx.businessId explicitly
 * (boundary check); RLS on the ctx client is the backstop.
 */

export async function listInvoices(ctx: ApiContext): Promise<InvoiceListItem[]> {
  const { data } = await ctx.supabase
    .from("invoice")
    .select("*, vendor(name), invoice_line(count)")
    .eq("business_id", ctx.businessId)
    .order("created_at", { ascending: false });

  return ((data ?? []) as Record<string, unknown>[]).map(
    (row) =>
      ({
        ...row,
        line_count:
          (row.invoice_line as Array<{ count: number }> | null)?.[0]?.count ?? 0,
      }) as InvoiceListItem,
  );
}

export interface InvoiceDetail {
  invoice: InvoiceRow & { vendor: Pick<VendorRow, "name"> | null };
  lines: InvoiceLineRow[];
  files: { path: string; url: string | null }[];
}

export async function getInvoice(
  ctx: ApiContext,
  invoiceId: string,
): Promise<InvoiceDetail> {
  const { data } = await ctx.supabase
    .from("invoice")
    .select("*, vendor(name)")
    .eq("business_id", ctx.businessId)
    .eq("id", invoiceId)
    .maybeSingle();
  if (!data) {
    throw new ApiError("not_found", "Invoice not found.");
  }
  const invoice = data as InvoiceDetail["invoice"];

  const { data: lineData } = await ctx.supabase
    .from("invoice_line")
    .select("*")
    .eq("business_id", ctx.businessId)
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: true });

  const files = await Promise.all(
    invoice.file_paths.map(async (path) => {
      const { data: signed } = await ctx.supabase.storage
        .from(INVOICES_BUCKET)
        .createSignedUrl(path, 3600);
      return { path, url: signed?.signedUrl ?? null };
    }),
  );

  return { invoice, lines: (lineData ?? []) as InvoiceLineRow[], files };
}

export async function getInvoiceStatus(
  ctx: ApiContext,
  invoiceId: string,
): Promise<{ status: string }> {
  const { data } = await ctx.supabase
    .from("invoice")
    .select("status")
    .eq("business_id", ctx.businessId)
    .eq("id", invoiceId)
    .maybeSingle();
  if (!data) {
    throw new ApiError("not_found", "Invoice not found.");
  }
  return { status: data.status };
}

/**
 * Upload one invoice file: storage write + `processing` row, then extraction
 * kicked after the response (SPEC §5.2). Returns the new invoice id.
 */
export async function uploadInvoice(
  ctx: ApiContext,
  file: File,
): Promise<{ invoiceId: string }> {
  // Spend guardrails BEFORE any storage write or Claude call (SPEC-SAAS §9.3):
  // rate limit first, then plan quota / trial / global kill switch. An
  // over-quota upload is rejected up front, never silently half-processed.
  await assertWithinRateLimit(ctx.businessId, UPLOAD_RATE_LIMIT);
  await assertClaudeGuardrail(ctx, "extraction");

  const client: InvoiceUploadClient = {
    async createInvoice(business_id, uploaded_by) {
      const { data, error } = await ctx.supabase
        .from("invoice")
        .insert({ business_id, uploaded_by, status: "processing" })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    async uploadFile(path, upload) {
      const { error } = await ctx.supabase.storage
        .from(INVOICES_BUCKET)
        .upload(path, upload, { contentType: upload.type });
      if (error) throw error;
    },
    async setFilePaths(invoiceId, paths) {
      const { error } = await ctx.supabase
        .from("invoice")
        .update({ file_paths: paths })
        .eq("business_id", ctx.businessId)
        .eq("id", invoiceId);
      if (error) throw error;
    },
    async deleteInvoice(invoiceId) {
      await ctx.supabase
        .from("invoice")
        .delete()
        .eq("business_id", ctx.businessId)
        .eq("id", invoiceId);
    },
  };

  const result = await performInvoiceUpload(client, {
    businessId: ctx.businessId,
    userId: ctx.userId,
    file,
  });
  if (!result.ok || !result.invoiceId) {
    throw new ApiError("validation_failed", result.error ?? "Upload failed.");
  }

  const invoiceId = result.invoiceId;
  after(() =>
    runExtractionForInvoice(invoiceId).catch((error) => {
      logger.error("background extraction crashed", {
        invoiceId,
        businessId: ctx.businessId,
        error: error instanceof Error ? error.message : String(error),
      });
    }),
  );
  return { invoiceId };
}

/**
 * Review submission (SPEC §3 steps 3–4). Boundary-checks that the invoice
 * belongs to the caller's tenant before the merge engine runs.
 */
export async function confirmInvoiceForTenant(
  ctx: ApiContext,
  payload: unknown,
): Promise<ConfirmResult> {
  const parsed = confirmInvoiceSchema.parse(payload);

  const { data: owned } = await ctx.supabase
    .from("invoice")
    .select("id")
    .eq("business_id", ctx.businessId)
    .eq("id", parsed.invoiceId)
    .maybeSingle();
  if (!owned) {
    throw new ApiError("not_found", "Invoice not found.");
  }

  const result = await confirmInvoice(createConfirmDeps(ctx.supabase), parsed);

  if (result.outcome === "confirmed") {
    await recordAudit({
      businessId: ctx.businessId,
      actorUserId: ctx.userId,
      action: "invoice.confirmed",
      entityType: "invoice",
      entityId: parsed.invoiceId,
      metadata: { lineCount: parsed.lines.length },
    });

    if (result.productIds.length > 0) {
      const productIds = result.productIds;
      after(() =>
        refreshMarketPricesForProducts(ctx.supabase, productIds).catch((error) =>
          logger.error("market refresh after confirm crashed", {
            invoiceId: parsed.invoiceId,
            businessId: ctx.businessId,
            error: error instanceof Error ? error.message : String(error),
          }),
        ),
      );
    }
  }
  return result;
}
