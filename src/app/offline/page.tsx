export const metadata = { title: "Offline — Margin" };

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">You&apos;re offline</h1>
      <p className="text-muted-foreground">
        Margin needs a connection to read invoices and update your catalog.
        Reconnect and we&apos;ll pick up right where you left off.
      </p>
      <p className="text-sm text-muted-foreground">
        Any invoice you upload is processed on our servers, so uploading needs a
        signal — snap the photos now and upload once you&apos;re back online.
      </p>
    </main>
  );
}
