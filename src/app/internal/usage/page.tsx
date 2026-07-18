import { notFound } from "next/navigation";
import { formatMicroUsd } from "@/lib/usage/cost";
import { loadUsageSummary } from "@/lib/usage/internal";
import { isOperatorRequest } from "@/lib/internal/operator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Operator-only cost dashboard: never statically cached, always live spend.
export const dynamic = "force-dynamic";

export default async function InternalUsagePage() {
  // Cross-tenant view: requires the env flag AND an allowlisted operator —
  // a signed-in customer must never reach this.
  if (!(await isOperatorRequest())) notFound();

  const rows = await loadUsageSummary();
  const totalMicroUsd = rows.reduce((n, r) => n + r.totalCostMicroUsd, 0);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Usage &amp; cost
        </h1>
        <p className="text-sm text-muted-foreground">
          Claude spend per tenant and month. Internal — not tenant-facing.
        </p>
      </div>

      <p className="text-sm text-muted-foreground">
        Total recorded spend:{" "}
        <span className="font-medium text-foreground">
          {formatMicroUsd(totalMicroUsd)}
        </span>
      </p>

      {rows.length === 0 ? (
        <p className="text-muted-foreground">No usage recorded yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tenant</TableHead>
              <TableHead>Period</TableHead>
              <TableHead className="text-right">Invoices</TableHead>
              <TableHead className="text-right">Extraction</TableHead>
              <TableHead className="text-right">Market</TableHead>
              <TableHead className="text-right">Total cost</TableHead>
              <TableHead className="text-right">Cost / invoice</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={`${r.businessId}-${r.period}`}>
                <TableCell className="font-medium">{r.businessName}</TableCell>
                <TableCell>{r.period}</TableCell>
                <TableCell className="text-right">
                  {r.invoicesProcessed}
                </TableCell>
                <TableCell className="text-right">{r.extractionCalls}</TableCell>
                <TableCell className="text-right">{r.marketCalls}</TableCell>
                <TableCell className="text-right">
                  {formatMicroUsd(r.totalCostMicroUsd)}
                </TableCell>
                <TableCell className="text-right">
                  {r.costPerInvoiceMicroUsd === null
                    ? "—"
                    : formatMicroUsd(r.costPerInvoiceMicroUsd)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </main>
  );
}
