"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { apiFetch, ApiClientError } from "@/lib/api/client";

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,application/pdf";

export function UploadForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit(selected: File) {
    setFile(selected);
    setError(null);
    const formData = new FormData();
    formData.set("file", selected);
    startTransition(async () => {
      try {
        const { invoiceId } = await apiFetch<{ invoiceId: string }>(
          "/api/v1/invoices",
          { method: "POST", body: formData },
        );
        router.push(`/invoices/${invoiceId}`);
      } catch (e) {
        setError(
          e instanceof ApiClientError ? e.message : "Upload failed. Try again.",
        );
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload an invoice file"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const dropped = e.dataTransfer.files[0];
          if (dropped) submit(dropped);
        }}
        className={cn(
          "flex min-h-48 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors",
          dragging ? "border-primary bg-accent" : "border-muted-foreground/30",
          isPending && "pointer-events-none opacity-60",
        )}
      >
        {isPending ? (
          <>
            <p className="font-medium">Uploading {file?.name}…</p>
            <p className="text-sm text-muted-foreground">
              Hang tight, this can take a moment for large PDFs.
            </p>
          </>
        ) : (
          <>
            <p className="font-medium">
              Drag an invoice here, or tap to choose a file
            </p>
            <p className="text-sm text-muted-foreground">
              Photos (JPEG, PNG, WebP, HEIC) or PDF, up to 20 MB.
            </p>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        name="file"
        accept={ACCEPT}
        // capture is intentionally omitted so mobile browsers offer both
        // camera and library; the button below forces the camera.
        className="hidden"
        onChange={(e) => {
          const selected = e.target.files?.[0];
          if (selected) submit(selected);
        }}
      />

      <CameraButton onCapture={submit} disabled={isPending} />

      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function CameraButton({
  onCapture,
  disabled,
}: {
  onCapture: (file: File) => void;
  disabled: boolean;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => cameraRef.current?.click()}
        className="sm:hidden"
      >
        Take a photo
      </Button>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const selected = e.target.files?.[0];
          if (selected) onCapture(selected);
        }}
      />
    </>
  );
}
