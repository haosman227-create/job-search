import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBusinessContext } from "@/lib/data/business";
import { formatCents } from "@/lib/domain";
import { INVOICES_BUCKET } from "@/lib/invoices/upload";
import type { InvoiceRow, VendorRow } from "@/lib/types";
import { InvoiceStatusBadge } from "@/components/invoice-status-badge";

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

  // Signed URLs because the bucket is private; an hour comfortably covers a
  // review session.
  const fileUrls = await Promise.all(
    invoice.file_paths.map(async (path) => {
      const { data: signed } = await supabase.storage
        .from(INVOICES_BUCKET)
        .createSignedUrl(path, 3600);
      return { path, url: signed?.signedUrl ?? null };
    }),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          {invoice.vendor?.name ?? "Invoice"}
        </h1>
        <InvoiceStatusBadge status={invoice.status} />
      </div>

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
            {invoice.total_cents != null ? formatCents(invoice.total_cents) : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Uploaded</dt>
          <dd>{new Date(invoice.created_at).toLocaleString()}</dd>
        </div>
      </dl>

      {invoice.status === "processing" ? (
        <p className="rounded-md bg-accent px-3 py-2 text-sm">
          Extraction is running — line items will appear here for review when
          it finishes.
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        <h2 className="font-medium">Original file</h2>
        {fileUrls.length === 0 ? (
          <p className="text-sm text-muted-foreground">No file attached.</p>
        ) : (
          fileUrls.map(({ path, url }) =>
            url ? (
              path.toLowerCase().endsWith(".pdf") ? (
                <a
                  key={path}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm underline"
                >
                  Open PDF in a new tab
                </a>
              ) : (
                // Signed, short-lived URL from a private bucket; next/image
                // can't optimize it and doesn't need to.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={path}
                  src={url}
                  alt="Uploaded invoice"
                  className="max-h-[70vh] w-fit rounded-md border object-contain"
                />
              )
            ) : (
              <p key={path} className="text-sm text-destructive">
                Could not load {path}.
              </p>
            ),
          )
        )}
      </div>

      <Link href="/invoices" className="text-sm underline">
        ← Back to invoices
      </Link>
    </div>
  );
}
