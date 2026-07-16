# CLAUDE.md

Smart invoicing app: upload a supplier invoice photo/PDF → AI extracts line items → living product catalog with cost, market price, sale price, and margin. Original single-business requirements in **SPEC.md**.

## Product direction — multi-tenant SaaS

The product is converting from a single-business internal tool into a **multi-tenant B2B SaaS** sold to independent retailers, with a web dashboard and a later native mobile client that consumes the same API. **Read SPEC-SAAS.md before implementing any new work** — it describes the delta from today's system to the paid product and the order it's built in. SPEC.md/ACCEPTANCE.md still describe the app that exists; SPEC-SAAS.md governs everything new.

- A `business` row **is a tenant**. Tenant zero (Minnehaha) runs on `main`/the live branch and must never break while the SaaS product is built on the `saas` line.
- New work is built one focused change per session, in the SPEC-SAAS.md build order (versioned API → metering → quotas → signup → billing → observability → data rights → PWA → native client).

## Stack

- **Next.js** (App Router, TypeScript, strict mode) — UI and API routes in one codebase
- **Supabase** — Postgres, auth, file storage; all tables behind row-level security scoped to `business`
- **Claude API** — invoice extraction (vision) and market-price estimation; server-side only, never expose the API key to the client
- **Tailwind CSS + shadcn/ui** for components; **TanStack Table** for the catalog

## Conventions

- TypeScript everywhere; no `any` without a comment justifying it.
- Database schema changes only via Supabase migrations checked into the repo.
- Money is stored as integer cents; margins as decimals. Never float arithmetic on money.
- All AI-extracted values carry a confidence field; UI must visually distinguish low-confidence data.
- Server components by default; client components only where interactivity requires it.
- API routes validate input with zod schemas shared with the frontend.
- Prices/costs are never silently overwritten: cost history lives in `invoice_line`, and manual sale-price overrides are explicit, marked fields.

## SaaS conventions (new work)

- **Tenant scoping is enforced at the API boundary from the authenticated identity; RLS is the backstop, never the only check.** Every new endpoint needs a cross-tenant access test that must fail.
- The web UI and the future native client consume **one** versioned `/api/v1/` surface — no logic path bypasses it. Pure domain functions stay the source of truth.
- Every Claude call is **metered on the write path** (no call without a usage event) and **quota-checked before it is made**.
- Secrets (Stripe, Anthropic, Supabase service role) live only in the deployment/dashboard env — never in the repo, a prompt, or a session.
- Audit log and usage events are **append-only** from the application path.
