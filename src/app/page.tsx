import type { Metadata } from "next";
import { Landing } from "@/components/landing/landing";

export const metadata: Metadata = {
  title: "Margin — your invoice becomes your food cost, in seconds",
  description:
    "Snap a supplier invoice; AI reads every line and your margins update themselves. The modern alternative to slow, expensive back-office tools.",
};

// Public landing page. Signed-in users never see it — the proxy sends them
// straight to /dashboard.
export default function LandingPage() {
  return <Landing />;
}
