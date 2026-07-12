import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBusinessContext } from "@/lib/data/business";
import { formatCents } from "@/lib/domain";
import { INVOICES_BUCKET } from "@/lib/invoices/upload";
import type { InvoiceLineRow, InvoiceRow, VendorRow } from "@/lib/types";
import { InvoiceStatusBadge } from "@/components/invoice-status-badge";
import { InvoiceStatusPoller } from "@/components/invoice-status-poller";
import { InvoiceImagePane } from "@/components/review/invoice-image-pane";
import { ReviewForm } from "@/components/review/review-form";
import { confirmInvoiceAction } from "../actions";

const REVIEWABLE = new Set(["needs_review", "partial"]);

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requireBusinessContext();

  const { data } = await supabase
    .from("invoice")
    .select("*, vendor(name)")
    .eq("id", id)
    .maybeSingle();

  if (!data) {
    notFound();
  }
  const invoice = data as InvoiceRow & { vendor: Pick<VendorRow, "name"> | null };

  const fileUrls = await Promise.all(
    invoice.file_paths.map(async (path) => {
      const { data: signed } = await supabase.storage
        .from(INVOICES_BUCKET)
        .createSignedUrl(path, 3600);
      return { path, url: signed?.signedUrl ?? null };
    }),
  );

  const reviewable = REVIEWABLE.has(invoice.status);
  let lines: InvoiceLineRow[] = [];
  if (reviewable) {
    const { data: lineData } = await supabase
      .from("invoice_line")
      .select("*")
      .eq("invoice_id", id)
      .order("created_at", { ascending: true });
    lines = (lineData ?? []) as InvoiceLineRow[];
  }

  return (
    <div className="flex flex-col gap-6">
      <InvoiceStatusPoller invoiceId={invoice.id} status={invoice.status} />
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          {invoice.vendor?.name ?? "Invoice"}
        </h1>
        <InvoiceStatusBadge status={invoice.status} />
      </div>

      {invoice.status === "processing" ? (
        <p className="rounded-md bg-accent px-3 py-2 text-sm">
          Extraction is running — line items will appear here for review when
          it finishes.
        </p>
      ) : null}

      {invoice.status === "failed" ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Extraction failed for this invoice. Re-upload the file to try again.
        </p>
      ) : null}

      {reviewable ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="lg:sticky lg:top-6 lg:self-start">
            <h2 className="mb-2 font-medium">Invoice image</h2>
            <InvoiceImagePane files={fileUrls} />
          </div>
          <div>
            <h2 className="mb-2 font-medium">Review &amp; confirm</h2>
            <ReviewForm
              invoiceId={invoice.id}
              header={{
                vendor_name: invoice.vendor?.name ?? "",
                invoice_number: invoice.invoice_number ?? "",
                invoice_date: invoice.invoice_date ?? "",
                total_cents: invoice.total_cents,
                confidence: {},
              }}
              lines={lines}
              confirmAction={confirmInvoiceAction}
            />
          </div>
        </div>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Invoice #</dt>
              <dd>{invoice.invoice_number ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Date</dt>
              <dd>{invoice.invoice_date ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Total</dt>
              <dd className="tabular-nums">
                {invoice.total_cents != null
                  ? formatCents(invoice.total_cents)
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Uploaded</dt>
              <dd>{new Date(invoice.created_at).toLocaleString()}</dd>
            </div>
          </dl>

          <div className="flex flex-col gap-3">
            <h2 className="font-medium">Original file</h2>
            <InvoiceImagePane files={fileUrls} />
          </div>
        </>
      )}

      <Link href="/invoices" className="text-sm underline">
        ← Back to invoices
      </Link>
    </div>
  );
}
