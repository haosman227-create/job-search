import { Badge } from "@/components/ui/badge";
import type { InvoiceStatus } from "@/lib/types";

const LABELS: Record<InvoiceStatus, string> = {
  processing: "Processing",
  needs_review: "Needs review",
  partial: "Partial",
  confirmed: "Confirmed",
  failed: "Failed",
};

const VARIANTS: Record<
  InvoiceStatus,
  React.ComponentProps<typeof Badge>["variant"]
> = {
  processing: "secondary",
  needs_review: "default",
  partial: "outline",
  confirmed: "secondary",
  failed: "destructive",
};

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return <Badge variant={VARIANTS[status]}>{LABELS[status]}</Badge>;
}
