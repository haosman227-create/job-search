import { notFound } from "next/navigation";
import { internalMetricsEnabled } from "@/lib/usage/internal";
import { loadAuditTrail } from "@/lib/audit/internal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Operator-only audit trail; always live.
export const dynamic = "force-dynamic";

export default async function InternalAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ business?: string; since?: string }>;
}) {
  if (!internalMetricsEnabled()) notFound();

  const { business, since } = await searchParams;
  const entries = await loadAuditTrail({ businessId: business, since });

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit trail</h1>
        <p className="text-sm text-muted-foreground">
          Every mutation across tenants. Internal — for incident
          reconstruction. Filter with <code>?business=&lt;id&gt;</code> and{" "}
          <code>?since=&lt;ISO date&gt;</code>.
        </p>
      </div>

      {entries.length === 0 ? (
        <p className="text-muted-foreground">No audit entries for this filter.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When (UTC)</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Summary</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap font-mono text-xs">
                    {e.createdAt.replace("T", " ").slice(0, 19)}
                  </TableCell>
                  <TableCell>{e.businessName}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {e.actorUserId ? (
                      <span className="font-mono text-xs">
                        {e.actorUserId.slice(0, 8)}
                      </span>
                    ) : (
                      "System"
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{e.action}</TableCell>
                  <TableCell>{e.summary}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </main>
  );
}
