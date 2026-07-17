/**
 * Pure invoice-image retention policy (SPEC-SAAS §5). Given a tenant's
 * retention window, decide which invoices' images are past it and should be
 * purged. No I/O — a scheduled job feeds rows in and deletes what this returns.
 * Retention applies to stored images, never to the extracted cost data.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RetentionInvoice {
  id: string;
  /** When the invoice (and its image) was created. */
  createdAt: string;
}

/**
 * Ids of invoices whose images are older than the retention window. A null
 * window means "keep until account deletion" — nothing is due.
 */
export function invoicesPastRetention(
  invoices: RetentionInvoice[],
  retentionDays: number | null,
  now: string,
): string[] {
  if (retentionDays === null || retentionDays <= 0) return [];
  const cutoff = Date.parse(now) - retentionDays * DAY_MS;
  return invoices
    .filter((inv) => Date.parse(inv.createdAt) < cutoff)
    .map((inv) => inv.id);
}
