"use client";

import { useEffect } from "react";

/**
 * Registers the service worker once, in the browser, in production only. Kept
 * out of dev so it never caches a stale shell during local work. Renders
 * nothing.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      typeof navigator === "undefined" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }
    const register = () =>
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // A failed registration must never break the app.
      });
    // Wait for load so registration doesn't contend with first paint.
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
