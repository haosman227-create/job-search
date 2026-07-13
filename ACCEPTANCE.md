# v1 Acceptance — SPEC §10

How each v1 success criterion is met, and where it's proven. "Code-verified"
means an automated test in this repo asserts the behavior; "needs live run"
means the mechanism is in place but the end-to-end timing/UX can only be
observed against a live Supabase project + Claude API (neither is available in
CI, so those paths are covered by unit/integration tests of their logic plus
opt-in live smoke tests).

## Criterion 1 — A 20-line invoice photo goes from upload to confirmed catalog entries in under 2 minutes including review

**Mechanism (in place):**
- Upload is a single storage write; extraction is **one** Claude vision call
  behind a background job so the browser never blocks (`src/lib/extraction/`,
  polled via `/api/invoices/[id]/status`).
- Review is a side-by-side screen with inline correction and one Confirm
  (`src/components/review/`), and confirm merges all lines in one pass
  (`src/lib/catalog/confirm.ts`).

**Proven:**
- Extraction of a real multi-line invoice image: opt-in live smoke test
  `src/lib/extraction/extract.live.test.ts` (asserts exact vendor/lines/total).
- Merge of confirmed lines into products: `src/test/db/confirm.test.ts`.
- **Needs live run** for the wall-clock < 2 min with a human reviewer.

## Criterion 2 — Catalog filter/sort interactions feel instant (<100 ms) at 5,000 products

**Code-verified:** `src/lib/catalog/row.test.ts` builds 5,000 catalog rows and
asserts that filter + search + sort (`applyCatalogView`, the exact function the
table consumes) completes in under 100 ms.

## Criterion 3 — A re-uploaded invoice is caught by duplicate detection

**Code-verified:** `src/test/db/confirm.test.ts` confirms an invoice, then
re-confirms the same vendor + invoice number + total (including across
formatting differences like `INV-1001` vs `inv 1001`) and asserts the duplicate
warning is returned and nothing is imported until an explicit override.

## Criterion 4 — Every price shown can be traced: cost → invoice line → invoice image

**Code-verified + mechanism:**
- Each confirmed line stores `product_id`, and the product's current cost is
  denormalized from its latest `invoice_line`; the full cost history is the
  product's invoice lines over time (`src/test/db/confirm.test.ts` asserts the
  product ← line ← invoice chain and the 75→80→90¢ history).
- The invoice detail page renders the original image/PDF via signed URLs
  alongside its extracted lines (`src/app/(app)/invoices/[id]/page.tsx`), so
  cost → line → image is navigable in the UI.

## Edge cases (SPEC §7) — all in scope, all covered

| Edge case | Where | Proof |
|---|---|---|
| Duplicate invoice detection | `confirm.ts` | `confirm.test.ts` |
| No barcode → vendor+name identity; attach/merge later | `merge.ts` | `merge.test.ts`, `barcode-merge.test.ts` |
| Multi-page & multi-invoice files | `extraction/job.ts` | `job.test.ts` |
| Illegible / partial extraction & later resolution | `extraction/job.ts`, `confirm.ts` | `job.test.ts`, `partial-resolution.test.ts` |

## Test summary

- Unit: `npm test` — money/pricing/identity, extraction schema + job, catalog
  row model + view + perf, price-update, markup, barcode merge, market policy.
- Integration (real Postgres): `npm run test:db` — schema + RLS isolation,
  signup, confirm/merge, markup change, barcode attach/merge, partial
  resolution.
- E2E: `npm run test:e2e` — auth gating of the app routes.
- Opt-in live (real Claude API): extraction and market-price smoke tests.
