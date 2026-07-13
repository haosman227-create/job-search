"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { inviteUser } from "@/app/(app)/settings/actions";

export function InviteForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();

  function invite() {
    setMessage(null);
    startTransition(async () => {
      const result = await inviteUser({ email: email.trim() });
      if (result.ok) {
        setMessage({ ok: true, text: `Invite sent to ${email.trim()}.` });
        setEmail("");
      } else {
        setMessage({ ok: false, text: result.message });
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Email address</span>
          <input
            type="email"
            className="w-64 rounded border bg-background px-2 py-1 text-sm"
            value={email}
            placeholder="teammate@example.com"
            onChange={(e) => setEmail(e.target.value)}
            aria-label="Invite email address"
          />
        </label>
        <Button
          type="button"
          size="sm"
          disabled={isPending || email.trim() === ""}
          onClick={invite}
        >
          Send invite
        </Button>
      </div>
      {message ? (
        <p
          className={
            message.ok
              ? "text-sm text-muted-foreground"
              : "rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          }
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
