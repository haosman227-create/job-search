/**
 * Upload pipeline core (SPEC §3 step 1): validate the file, create the
 * invoice row in `processing`, store the original under
 * <business_id>/<invoice_id>/<filename>, and record the storage path.
 * Extraction picks the invoice up in Phase 5.
 *
 * Kept framework-free (the Supabase surface is injected) so the flow is
 * unit-testable without a live project.
 */

export const INVOICES_BUCKET = "invoices";
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export const ALLOWED_UPLOAD_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
]);

export interface UploadFileLike {
  name: string;
  type: string;
  size: number;
}

export function validateUploadFile(file: UploadFileLike): string | null {
  if (file.size === 0) {
    return "The selected file is empty.";
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return "File is too large (20 MB max).";
  }
  if (!ALLOWED_UPLOAD_TYPES.has(file.type)) {
    return "Upload a photo (JPEG, PNG, WebP, HEIC) or a PDF.";
  }
  return null;
}

/** <business>/<invoice>/<safe filename> — first segment drives storage RLS. */
export function buildStoragePath(
  businessId: string,
  invoiceId: string,
  fileName: string,
): string {
  const safeName =
    fileName
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      // No leading dots/dashes: keeps relative-path tricks ("../") inert.
      .replace(/^[-.]+/, "")
      .replace(/-+$/, "")
      .slice(-100) || "upload";
  return `${businessId}/${invoiceId}/${safeName}`;
}

/** The narrow slice of the Supabase client the upload flow needs. */
export interface InvoiceUploadClient {
  createInvoice(businessId: string, uploadedBy: string): Promise<{ id: string }>;
  uploadFile(path: string, file: File): Promise<void>;
  setFilePaths(invoiceId: string, paths: string[]): Promise<void>;
  deleteInvoice(invoiceId: string): Promise<void>;
}

export interface UploadResult {
  ok: boolean;
  invoiceId?: string;
  error?: string;
}

export async function performInvoiceUpload(
  client: InvoiceUploadClient,
  params: { businessId: string; userId: string; file: File },
): Promise<UploadResult> {
  const validationError = validateUploadFile(params.file);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  const invoice = await client.createInvoice(params.businessId, params.userId);
  const path = buildStoragePath(params.businessId, invoice.id, params.file.name);

  try {
    await client.uploadFile(path, params.file);
    await client.setFilePaths(invoice.id, [path]);
  } catch {
    // Without the original file the row is unrecoverable noise — remove it
    // so the user can simply retry.
    await client.deleteInvoice(invoice.id).catch(() => {});
    return { ok: false, error: "Upload failed. Please try again." };
  }

  return { ok: true, invoiceId: invoice.id };
}
