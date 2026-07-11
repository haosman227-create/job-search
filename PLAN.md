# Implementation Plan — Smart Invoicing & Product Margin App

Derived from [SPEC.md](./SPEC.md). Phases are ordered so each one ends with something
runnable and testable, and later phases only depend on earlier ones. No code is written
until this plan is approved.

**Testing approach used throughout:**

- **Unit tests (Vitest)** for pure domain logic (money, pricing, matching, merge rules).
- **Integration tests** against a local Supabase instance (`supabase start`) for schema,
  RLS, and server actions/API routes.
- **E2E tests (Playwright)** for the user-facing flows, with the Claude API mocked by
  fixture responses; one opt-in live smoke script exercises the real API.
- CI runs lint, typecheck, unit, and integration on every push from Phase 0 onward.

---

## Phase 0 — Scaffold & tooling

Project skeleton with all conventions from CLAUDE.md enforced from day one.

- Next.js (App Router, TypeScript `strict`), Tailwind CSS, shadcn/ui initialized.
- ESLint (incl. `no-explicit-any` as error), Prettier, Vitest, Playwright configured.
- Env var handling (`ANTHROPIC_API_KEY`, Supabase keys) — server-only, validated at boot
  with zod; a `.env.example` documents them.
- App shell: top-level layout with placeholder nav (Catalog / Invoices / Settings).

**Testable outcome:** `npm run lint`, `typecheck`, `test`, and `build` all pass; the app
boots and renders the shell. CI is green on the first commit.

## Phase 1 — Database schema, RLS, migrations

The full data model from SPEC §6 as Supabase migrations checked into the repo.

- Tables: `business`, `membership` (auth user ↔ business), `vendor`, `department`,
  `product`, `invoice`, `invoice_line`. Money columns are integer cents; confidence
  fields on every AI-extracted column; `invoice_line` is the cost history.
- RLS on every table scoped to the caller's business; storage bucket policy for invoice
  files scoped the same way.
- Seed migration for a default department set.

**Testable outcome:** integration tests prove (a) migrations apply cleanly to a fresh
local Supabase, (b) a user in business A cannot read/write any row or file of business B,
(c) money columns reject non-integers.

## Phase 2 — Auth & workspace

- Email/password sign-up; first sign-up creates the `business` and membership atomically.
- Login/logout, protected routes, session handling in server components.
- Empty-state Catalog and Invoices pages behind auth.

**Testable outcome:** Playwright e2e — sign up, land on an empty catalog; a second
account in a different business sees none of the first account's data.

## Phase 3 — Domain logic library (pure functions)

All money/pricing/matching rules as a dependency-free `lib/domain` module with shared
zod schemas, before any feature uses them.

- Integer-cents arithmetic helpers; margin `= (sale − cost) / sale`.
- Sale-price computation: `cost × department markup` → psychological rounding (.99).
- Product-name normalization and vendor-name dedup rules.
- Product identity resolution: barcode when present, else vendor + normalized name.
- Duplicate-invoice detection predicate (vendor + invoice number + total).

**Testable outcome:** exhaustive unit tests, including rounding edge cases (zero cost,
markup 0%, cents that round across a dollar boundary) and identity/dedup tables of
tricky name pairs.

## Phase 4 — Upload & invoices list

- Upload UI: drag-and-drop and mobile camera capture; files go to Supabase Storage;
  an `invoice` row is created with status `processing`.
- Invoices list page: vendor, date, total, line count, status; click through to the
  stored original file.

**Testable outcome:** e2e — upload a photo and a PDF; both appear in the list as
`processing` and the original file opens. (No extraction yet — status stays
`processing` until Phase 5.)

## Phase 5 — Extraction pipeline (background job)

- Server-side Claude vision call (`claude-sonnet-5`): extracts vendor, invoice number,
  date, total, and per line: barcode, name, quantity, unit cost, line total — each with
  a confidence score, validated by a zod schema shared with the review UI.
- Background job pattern from SPEC §8: extraction runs after upload returns; the client
  polls a status endpoint (`processing → needs review / partial / failed`).
- Multi-page PDFs stitched into one extraction; multi-invoice files detected and split
  into separate `invoice` rows; illegible lines stored as flagged placeholder rows.

**Testable outcome:** a fixture set of invoices (clean photo, multi-page PDF,
multi-invoice PDF, partly illegible photo) runs through the pipeline with a mocked
Claude client and produces the expected rows and status transitions; schema-validation
unit tests reject malformed model output; one live smoke script hits the real API.

## Phase 6 — Confirm & catalog merge engine (server only)

The core write path, built and tested before its UI exists.

- Confirm endpoint: validates edited lines, then merges into the catalog —
  vendor upsert, product identity resolution (Phase 3), cost history via
  `invoice_line`, denormalized current cost on `product`.
- Department auto-assignment via Claude with confidence flag stored on the product.
- Initial sale price computed from department markup (Phase 3); never overwrites an
  existing manual override.
- Duplicate detection on confirm: warn payload returned; import proceeds only with an
  explicit override flag.
- Partial invoices: readable lines merge, invoice stays `partial`.

**Testable outcome:** integration tests — confirming a fixture invoice creates the right
products/lines; re-confirming the same invoice returns the duplicate warning and imports
only with override; a second invoice for an existing product appends cost history and
updates current cost without touching a sale-price override.

## Phase 7 — Review screen (UI for Phase 6)

- Side-by-side: zoomable invoice image ↔ editable extracted table.
- Per-field confidence highlighting; inline correction; manual line add/remove;
  illegible-row editing; one-invoice-at-a-time flow for split files.
- Confirm button wired to the Phase 6 endpoint, including the duplicate-override dialog.

**Testable outcome:** e2e of the full core loop — upload → wait for extraction → correct
a field → confirm → products appear in the catalog. The SPEC's ~30-second review flow is
walkable end to end for the first time.

## Phase 8 — Catalog table

- TanStack Table: barcode · name · department · vendor · cost · market price · sale
  price · margin %. Default sort: highest margin; all columns sortable.
- Filters (department, vendor), search (name/barcode).
- Inline edit: sale price (sets the marked manual override; clearable) and department
  (clears the low-confidence badge).
- Badges: low-confidence department, cost-increase indicator, manual-override marker.

**Testable outcome:** e2e — filters, sort, search, and both inline edits persist and
survive reload; a seeded 5,000-product business keeps filter/sort interactions under
the SPEC's 100 ms target (measured in the e2e run).

## Phase 9 — Market price estimation

- Server-side Claude call estimating typical retail price from name/barcode/department.
- Cached per product with fetched-at timestamp; refreshed only on material cost change
  (threshold defined here) or manual refresh; clearly labeled as an AI estimate in the UI.
- Catalog highlighting where sale price is above/below market.

**Testable outcome:** unit tests on the refresh policy (no re-fetch on trivial cost
change, re-fetch past threshold, manual refresh always); e2e shows the AI-estimate label
and above/below-market highlighting.

## Phase 10 — Settings

- Departments CRUD with markup % and display order.
- Business profile; user invitations via Supabase auth email invites.

**Testable outcome:** e2e — change a department's markup, confirm a new invoice, and the
new product's computed sale price reflects the new markup (existing prices untouched);
an invited user joins the same business and sees its catalog.

## Phase 11 — Edge-case hardening & v1 acceptance

- Barcode attach/merge: attach a barcode to a barcode-less product; merge duplicates
  created both ways, preserving combined cost history.
- Partial-invoice resolution flow: fix illegible lines later, invoice leaves `partial`.
- Mobile polish on the upload/review flow; empty states; error states for failed
  extraction.
- Run the SPEC §10 acceptance checklist: 20-line invoice under 2 minutes; duplicate
  re-upload caught; every price traceable cost → invoice line → invoice image.

**Testable outcome:** the acceptance checklist passes end to end and is recorded in the
PR; merge and partial-resolution flows covered by integration + e2e tests.

---

## Dependencies at a glance

```
0 → 1 → 2 → 4 → 5 → 7 ─┐
         3 ──→ 6 ───────┼→ 8 → 9
                        └→ 10 → 11
```

Phase 3 (pure domain logic) can start any time after Phase 0 and is a prerequisite for
Phase 6. Everything else is strictly sequential.
