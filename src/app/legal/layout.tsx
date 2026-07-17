import Link from "next/link";

export default function LegalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <header className="flex items-center justify-between">
        <Link href="/" className="font-semibold tracking-tight">
          Margin
        </Link>
        <nav className="flex gap-4 text-sm text-muted-foreground">
          <Link href="/legal/terms" className="hover:text-foreground">
            Terms
          </Link>
          <Link href="/legal/privacy" className="hover:text-foreground">
            Privacy
          </Link>
        </nav>
      </header>

      {/* These documents are placeholders and must be reviewed by counsel
          before the product is sold. */}
      <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
        <strong>Draft — pending legal review.</strong> This document is a
        placeholder and is not yet legally binding.
      </p>

      <article className="prose-sm flex flex-col gap-4 text-sm leading-relaxed">
        {children}
      </article>
    </div>
  );
}
