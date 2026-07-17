export const metadata = { title: "Privacy Policy — Margin" };

export default function PrivacyPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="text-muted-foreground">Last updated: draft</p>

      <h2 className="text-lg font-medium">What we collect</h2>
      <p>
        Your account details, the supplier invoices you upload (images/PDFs and
        the data extracted from them), and product/pricing data you create. We
        record usage and an audit trail of changes for security and billing.
      </p>

      <h2 className="text-lg font-medium">Tenant isolation</h2>
      <p>
        Your data is isolated to your workspace. Access is enforced both at our
        API boundary and by database row-level security. We do not sell your
        data.
      </p>

      <h2 className="text-lg font-medium">AI processing of invoice images</h2>
      <p>
        To read your invoices we send the image or PDF to our AI provider,
        Anthropic, which processes it to extract line items and estimate market
        prices. This is essential to the service. You control how long we retain
        the original images with the <strong>image-retention setting</strong> in
        Settings — images older than your chosen window are deleted, while the
        extracted cost data remains in your catalog.
      </p>

      <h2 className="text-lg font-medium">Export &amp; deletion</h2>
      <p>
        You can export all of your data at any time from Settings. You can also
        request account deletion; after a short grace period (during which you
        can cancel) all of your data is permanently removed.
      </p>

      <h2 className="text-lg font-medium">Payments</h2>
      <p>
        Subscription payments are handled by Stripe. We store only the
        identifiers needed to manage your subscription, never your card details.
      </p>

      <p className="text-muted-foreground">
        Placeholder policy — final language, data-processing terms, and
        sub-processor disclosures pending legal review.
      </p>
    </>
  );
}
