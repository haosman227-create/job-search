export const metadata = { title: "Terms of Service — Margin" };

export default function TermsPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Terms of Service</h1>
      <p className="text-muted-foreground">Last updated: draft</p>

      <h2 className="text-lg font-medium">1. The service</h2>
      <p>
        Margin turns supplier invoices into a living product catalog with costs,
        market prices, and margins. You are responsible for the accuracy of the
        data you upload and for how you price and sell your products.
      </p>

      <h2 className="text-lg font-medium">2. Accounts &amp; plans</h2>
      <p>
        Each workspace is a separate tenant. Paid plans carry monthly invoice
        limits; your trial gives you a small allowance with no card required.
        Reaching a limit pauses new invoice processing but never deletes your
        data.
      </p>

      <h2 className="text-lg font-medium">3. Acceptable use</h2>
      <p>
        Upload only invoices you are authorized to process. Don&apos;t attempt to
        access another tenant&apos;s data or to disrupt the service.
      </p>

      <h2 className="text-lg font-medium">4. Data</h2>
      <p>
        Your data is yours. You can export it in full or delete your account at
        any time from Settings; see the{" "}
        <a href="/legal/privacy" className="underline">
          Privacy Policy
        </a>{" "}
        for how your data is handled, including AI processing of invoice images.
      </p>

      <h2 className="text-lg font-medium">5. Disclaimers</h2>
      <p>
        AI-extracted and AI-estimated values (including market prices) are
        best-effort and may be wrong; review them before relying on them. The
        service is provided &quot;as is&quot; to the extent permitted by law.
      </p>

      <p className="text-muted-foreground">
        Placeholder terms — final language pending legal review.
      </p>
    </>
  );
}
