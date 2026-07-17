"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * "Add to home screen" nudge. Chromium fires beforeinstallprompt when the app
 * is installable; we stash it and surface a button so a stockroom user can
 * install with one tap. Hidden when already installed or unsupported (e.g. iOS
 * Safari, which installs via the Share sheet instead).
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", () => setDeferred(null));
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!deferred) return null;

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
      <span>Install Margin for one-tap invoice uploads from your phone.</span>
      <Button
        size="sm"
        onClick={async () => {
          await deferred.prompt();
          await deferred.userChoice;
          setDeferred(null);
        }}
      >
        Install
      </Button>
    </div>
  );
}
