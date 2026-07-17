import Link from "next/link";
import { requireBusinessContext } from "@/lib/data/business";
import { listInvoices } from "@/lib/api/services/invoices";
import { formatCents } from "@/lib/domain";
import { Button } from "@/components/ui/button";
import { InvoiceStatusBadge } from "@/components/invoice-status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function InvoicesPage() {
  const ctx = await requireBusinessContext();
  const invoices = await listInvoices(ctx);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
        <Button render={<Link href="/invoices/upload" />}>
          Upload invoice
        </Button>
      </div>

      {invoices.length === 0 ? (
        <p className="text-muted-foreground">
          No invoices yet. Snap a photo of a supplier invoice to get started.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vendor</TableHead>
              <TableHead>Invoice #</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Lines</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((invoice) => (
              <TableRow key={invoice.id}>
                <TableCell>
                  <Link
                    href={`/invoices/${invoice.id}`}
                    className="font-medium hover:underline"
                  >
                    {invoice.vendor?.name ?? "Unknown vendor"}
                  </Link>
                </TableCell>
                <TableCell>{invoice.invoice_number ?? "—"}</TableCell>
                <TableCell>{invoice.invoice_date ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {invoice.total_cents != null
                    ? formatCents(invoice.total_cents)
                    : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {invoice.line_count}
                </TableCell>
                <TableCell>
                  <InvoiceStatusBadge status={invoice.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
