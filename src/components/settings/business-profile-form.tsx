"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { updateBusinessProfile } from "@/app/(app)/settings/actions";

export function BusinessProfileForm({ name: initial }: { name: string }) {
  const router = useRouter();
  const [name, setName] = useState(initial);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await updateBusinessProfile({ name: name.trim() });
      if (!result.ok) setMessage(result.message);
      else {
        setMessage("Saved.");
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-muted-foreground">Business name</span>
        <input
          className="w-64 rounded border bg-background px-2 py-1 text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Business name"
        />
      </label>
      <Button
        type="button"
        size="sm"
        disabled={isPending || name.trim() === "" || name.trim() === initial}
        onClick={save}
      >
        Save
      </Button>
      {message ? (
        <span className="text-sm text-muted-foreground">{message}</span>
      ) : null}
    </div>
  );
}
