"use client";

import Link from "next/link";
import { useState } from "react";
import { apiJson, ApiClientError } from "@/lib/api/client";
import type { DataRights } from "@/lib/api/services/account";
import type { DeletionStatus } from "@/lib/account/deletion";
import { Button } from "@/components/ui/button";

const RETENTION_OPTIONS: { label: string; value: number | null }[] = [
  { label: "Keep until I delete my account", value: null },
  { label: "90 days", value: 90 },
  { label: "1 year", value: 365 },
  { label: "2 years", value: 730 },
];

export function DataPrivacySection({ initial }: { initial: DataRights }) {
  const [deletion, setDeletion] = useState<DeletionStatus>(initial.deletion);
  const [retention, setRetention] = useState<number | null>(
    initial.imageRetentionDays,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError(null);
    setSaved(false);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  const changeRetention = (value: number | null) =>
    run("retention", async () => {
      await apiJson("/api/v1/account/retention", "PATCH", { retentionDays: value });
      setRetention(value);
      setSaved(true);
    });

  const requestDeletion = () =>
    run("delete", async () => {
      const { deletion } = await apiJson<{ deletion: DeletionStatus }>(
        "/api/v1/account/deletion",
        "POST",
      );
      setDeletion(deletion);
    });

  const cancelDeletion = () =>
    run("cancel", async () => {
      await apiJson("/api/v1/account/deletion", "DELETE");
      setDeletion({
        pending: false,
        requestedAt: null,
        purgeAfter: null,
        daysRemaining: null,
        dueForPurge: false,
      });
    });

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Export */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-medium">Export your data</p>
          <p className="text-sm text-muted-foreground">
            Download everything — invoices, catalog, and history — as JSON.
          </p>
        </div>
        <Button
          render={<a href="/api/v1/account/export" download />}
          variant="outline"
          size="sm"
        >
          Export JSON
        </Button>
      </div>

      {/* Image retention */}
      <div className="flex flex-col gap-2">
        <div>
          <p className="font-medium">Invoice image retention</p>
          <p className="text-sm text-muted-foreground">
            How long original invoice images are kept. Extracted costs always
            stay in your catalog.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={retention === null ? "null" : String(retention)}
            onChange={(e) =>
              changeRetention(e.target.value === "null" ? null : Number(e.target.value))
            }
            disabled={busy === "retention"}
            className="rounded-md border bg-background px-3 py-2 text-sm"
          >
            {RETENTION_OPTIONS.map((o) => (
              <option key={o.label} value={o.value === null ? "null" : String(o.value)}>
                {o.label}
              </option>
            ))}
          </select>
          {saved && <span className="text-sm text-muted-foreground">Saved</span>}
        </div>
      </div>

      {/* Delete account */}
      <div className="flex flex-col gap-2 rounded-lg border border-destructive/30 p-4">
        <p className="font-medium">Delete account</p>
        {deletion.pending ? (
          <>
            <p className="text-sm text-muted-foreground">
              Your account is scheduled for deletion
              {deletion.daysRemaining !== null
                ? ` in ${deletion.daysRemaining} day${deletion.daysRemaining === 1 ? "" : "s"}`
                : ""}
              . You can still cancel — nothing is deleted until then.
            </p>
            <div>
              <Button
                onClick={cancelDeletion}
                disabled={busy !== null}
                variant="outline"
                size="sm"
              >
                {busy === "cancel" ? "Canceling…" : "Cancel deletion"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Permanently delete this workspace and all its data after a 30-day
              grace period. This cannot be undone once the grace period ends.
            </p>
            <div>
              <Button
                onClick={() => {
                  if (
                    window.confirm(
                      "Request account deletion? You'll have 30 days to cancel before your data is permanently removed.",
                    )
                  ) {
                    requestDeletion();
                  }
                }}
                disabled={busy !== null}
                variant="destructive"
                size="sm"
              >
                {busy === "delete" ? "Requesting…" : "Request deletion"}
              </Button>
            </div>
          </>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        See our{" "}
        <Link href="/legal/privacy" className="underline">
          Privacy Policy
        </Link>{" "}
        and{" "}
        <Link href="/legal/terms" className="underline">
          Terms
        </Link>
        .
      </p>
    </div>
  );
}
