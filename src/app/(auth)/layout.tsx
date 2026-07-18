import Link from "next/link";

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="mb-8 text-center">
        <Link href="/" className="text-2xl font-semibold tracking-tight">
          Margin<span className="text-primary">.</span>
        </Link>
        <p className="text-sm text-muted-foreground">
          Invoices in, margins out.
        </p>
      </div>
      <div className="glass w-full max-w-sm rounded-2xl p-6">{children}</div>
    </div>
  );
}
