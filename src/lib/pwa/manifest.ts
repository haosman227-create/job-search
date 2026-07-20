import type { MetadataRoute } from "next";

/**
 * Web app manifest (SPEC-SAAS §9.8): makes the dashboard installable to a phone
 * home screen so a stockroom user launches straight into upload. Pure so the
 * required fields are unit-testable; app/manifest.ts just returns this.
 *
 * Icons are SVG for crispness at any size; a production deploy can swap in
 * rasterized PNGs if a target browser needs them.
 */
export function buildManifest(): MetadataRoute.Manifest {
  return {
    name: "Margin — Smart Invoicing",
    short_name: "Margin",
    description:
      "Upload supplier invoices and turn them into a living product catalog with costs and margins.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#faf6ef",
    theme_color: "#faf6ef",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      {
        src: "/icon-maskable.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
