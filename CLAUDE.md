# CLAUDE.md

Smart invoicing app: upload a supplier invoice photo/PDF → AI extracts line items → living product catalog with cost, market price, sale price, and margin. Full requirements in **SPEC.md** — read it before implementing anything.

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
