"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/** Zoomable invoice image / PDF link for the review screen (SPEC §5.2). */
export function InvoiceImagePane({
  files,
}: {
  files: { path: string; url: string | null }[];
}) {
  const [zoomed, setZoomed] = useState(false);

  if (files.length === 0) {
    return <p className="text-sm text-muted-foreground">No file attached.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {files.map(({ path, url }) => {
        if (!url) {
          return (
            <p key={path} className="text-sm text-destructive">
              Could not load the file.
            </p>
          );
        }
        if (path.toLowerCase().endsWith(".pdf")) {
          return (
            <a
              key={path}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm underline"
            >
              Open PDF in a new tab
            </a>
          );
        }
        return (
          <button
            key={path}
            type="button"
            onClick={() => setZoomed((z) => !z)}
            className="block cursor-zoom-in overflow-auto rounded-md border"
            aria-label={zoomed ? "Zoom out" : "Zoom in"}
          >
            {/* Signed short-lived URL from a private bucket; next/image can't
                optimize it. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt="Uploaded invoice"
              className={cn(
                "w-full object-contain transition-transform",
                zoomed ? "max-w-none scale-150 cursor-zoom-out" : "max-h-[80vh]",
              )}
            />
          </button>
        );
      })}
      <p className="text-xs text-muted-foreground">Tap the image to zoom.</p>
    </div>
  );
}
