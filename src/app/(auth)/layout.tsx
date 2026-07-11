export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Margin</h1>
        <p className="text-sm text-muted-foreground">
          Invoices in, margins out.
        </p>
      </div>
      <div className="w-full max-w-sm rounded-lg border bg-card p-6 shadow-sm">
        {children}
      </div>
    </div>
  );
}
