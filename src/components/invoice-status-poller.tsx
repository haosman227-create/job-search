"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 3000;

/**
 * While an invoice is processing, polls its status endpoint and refreshes the
 * page when extraction finishes (SPEC §5.2: don't block the browser tab).
 */
export function InvoiceStatusPoller({
  invoiceId,
  status,
}: {
  invoiceId: string;
  status: string;
}) {
  const router = useRouter();

  useEffect(() => {
    if (status !== "processing") return;

    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/v1/invoices/${invoiceId}/status`);
        if (!response.ok) return;
        const body: { status?: string } = await response.json();
        if (body.status && body.status !== "processing") {
          router.refresh();
        }
      } catch {
        // Transient network failure — try again on the next tick.
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [invoiceId, status, router]);

  return null;
}
