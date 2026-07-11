import { UploadForm } from "./upload-form";

export default async function UploadPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Upload invoice
        </h1>
        <p className="text-muted-foreground">
          We&apos;ll extract the line items automatically and let you review
          them before anything hits the catalog.
        </p>
      </div>
      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <UploadForm />
    </div>
  );
}
