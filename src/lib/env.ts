import "server-only";
import { z } from "zod";

/**
 * Server-side environment access. Secrets (Anthropic key, service-role key)
 * must never reach the client: this module is guarded by `server-only` and
 * validated lazily so local builds and CI don't require real credentials.
 */
const serverEnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
  NEXT_PUBLIC_SUPABASE_URL: z.url({
    error: "NEXT_PUBLIC_SUPABASE_URL must be a valid URL",
  }),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
  // Opt-in gate for the internal cost dashboard (SPEC-SAAS §9.2). Unset in
  // production tenant environments; "1" only where operators view spend.
  INTERNAL_METRICS_ENABLED: z.string().optional(),
  // Comma-separated emails allowed into /internal/* when the flag is on.
  // Empty/unset admits no one — the flag alone never grants access.
  OPERATOR_EMAILS: z.string().optional(),
  // Stripe billing (SPEC-SAAS §9.5). All optional so local/CI builds run
  // without billing configured; the billing endpoints degrade to 503 until the
  // secret + webhook secret + plan price ids are present in the deploy env.
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_STARTER: z.string().optional(),
  STRIPE_PRICE_GROWTH: z.string().optional(),
  STRIPE_PRICE_PRO: z.string().optional(),
  // Public base URL for Checkout success/cancel redirects; falls back to the
  // request origin when unset.
  NEXT_PUBLIC_APP_URL: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

export function getServerEnv(
  source: Record<string, string | undefined> = process.env,
): ServerEnv {
  if (source === process.env && cached) return cached;
  const parsed = serverEnvSchema.safeParse(source);
  if (!parsed.success) {
    const missing = parsed.error.issues
      .map((issue) => issue.path.join("."))
      .join(", ");
    throw new Error(`Invalid or missing environment variables: ${missing}`);
  }
  if (source === process.env) cached = parsed.data;
  return parsed.data;
}
