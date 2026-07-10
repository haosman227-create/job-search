# SPEC — Smart Invoicing & Product Margin App

**Status:** Approved after discovery interview (2026-07-10). No application code exists yet.

## 1. One-line summary

A responsive web app for a small business: staff upload a photo or PDF of a supplier invoice, AI extracts every line item into a living product catalog that shows cost, market price, sale price, and profit margin — filterable by department and vendor.

## 2. Target user

- **Small business, 1–20 staff** (retail-style: products bought from vendors and resold).
- Staff snap invoice photos on their phones; owner/manager reviews the catalog and margins on a desktop-sized screen.
- Multiple user accounts belong to one shared business workspace. **No roles/permissions in v1** — every user can do everything. (Roles are a future feature.)

## 3. Core loop (v1)

1. **Upload** — user uploads a photo or PDF of a supplier invoice (phone camera via browser, or file picker).
2. **Extract** — Claude vision API extracts: vendor, invoice number, invoice date, invoice total, and per line item: barcode (if present), product name, quantity, unit cost, line total.
3. **Quick review** — a side-by-side screen: invoice image on one side, extracted table on the other. User corrects any field inline and hits **Confirm** (~30 seconds for a clean invoice).
4. **Catalog update** — confirmed lines merge into the product catalog (see data model). Departments are assigned **fully automatically** by AI; low-confidence assignments get a visible warning badge in the catalog and are editable inline with one click.

## 4. Pricing model

Three price concepts per product:

| Field | Source | Behavior |
|---|---|---|
| **Cost** | Extracted from the latest invoice line | Historical costs kept per invoice (cost history). |
| **Market price** | LLM call: given product name, barcode, and category, Claude estimates a typical retail price | A benchmark, never used directly for margin. Cached per product; refreshed only when cost changes materially or on manual refresh. Clearly labeled as an AI estimate. |
| **Sale price** | Computed: `cost × department markup`, rounded to psychological pricing (e.g., .99) | This is the price the business charges. Editable inline — a manual override sticks and is visually marked until cleared. |

- **Margin** = `(sale price − cost) / sale price`, always computed from the current sale price and latest cost.
- Each **department carries a target markup %** (e.g., Grocery 30%, Tobacco 12%), editable in a settings screen.
- The catalog highlights where sale price is above/below market price so the owner can spot mispricing at a glance.

## 5. Core screens (UI/UX)

Design goal from the interview: "beautiful, easy, modern UI." Clean, dense-but-readable data table; mobile-friendly upload flow; desktop-first catalog.

### 5.1 Catalog (main screen)
- Table columns: **barcode · product name · department · vendor · cost · market price (AI) · sale price · margin %**.
- **Filters:** department, vendor. **Sorting:** any column; default sort by highest margin. ("Highest revenue" sorting is out of scope for v1 — invoices contain no sales data; it becomes possible only if sales data is added later.)
- Inline editing: sale price, department. Low-confidence department badge; cost-increase indicator when the latest invoice raised a product's cost.
- Search box (name/barcode).

### 5.2 Upload & review
- Drag-and-drop / camera capture upload.
- Extraction progress state (extraction can take tens of seconds for multi-page PDFs — show a background-job status, don't block the browser tab).
- Side-by-side review: zoomable invoice image ↔ editable extracted table; per-field confidence highlighting; Confirm button.

### 5.3 Invoices list
- All uploaded invoices: vendor, date, total, line count, status (processing / needs review / confirmed / partial). Click through to the original image and its extracted lines.

### 5.4 Settings
- Departments and their markup %.
- Business profile, user invitations (Supabase auth email invites).

## 6. Data model

Living catalog with cost history (chosen over invoice-log-only and latest-cost-only).

- **business** — one per workspace; all data is scoped to it.
- **user** — Supabase auth user, member of one business.
- **vendor** — created automatically from extraction; deduped by normalized name.
- **department** — name, target markup %, display order. Seeded with a default set; editable.
- **product** — one record per distinct product. Identity: **barcode** when present; otherwise **vendor + normalized product name**. Fields: barcode (nullable), name, department (+ confidence flag), current cost (denormalized from latest confirmed invoice line), market price (+ fetched-at timestamp), sale price override (nullable), archived flag.
- **invoice** — vendor, invoice number, invoice date, total, status, uploaded-by, link to source file(s) in Supabase Storage, extraction metadata (model, confidence).
- **invoice_line** — belongs to invoice, links to product. Fields: raw extracted text, quantity, unit cost, line total, per-field confidence, `illegible` flag. This table **is** the cost history: a product's cost trend = its invoice lines over time.

## 7. Edge cases (all in scope for v1)

1. **Duplicate invoice detection** — on confirm, match vendor + invoice number + total against existing invoices; warn and require explicit override before importing again. Same guard whether the duplicate arrives as photo or PDF.
2. **No barcode on line item** — product identity falls back to vendor + normalized name. Barcode-less products are first-class; a barcode can be attached later and merges are supported if the same product was created both ways.
3. **Multi-page and multi-invoice files** — a multi-page PDF is treated as one invoice (pages stitched for extraction). If extraction detects multiple distinct invoices in one file (different vendor/invoice-number blocks), it splits them and the review screen shows one invoice at a time.
4. **Unreadable / partial extraction** — illegible lines are imported as flagged placeholder rows with whatever fields were readable; the review screen supports manual line entry and editing. An invoice with illegible lines is marked "partial" until resolved, but readable lines still flow to the catalog on confirm.

## 8. Tech stack (decided)

- **Next.js (App Router, TypeScript)** — UI + API routes, single codebase.
- **Supabase** — Postgres database, auth (email/password + invites), file storage for invoice images/PDFs. Row-level security scopes all data to the business.
- **Claude API** (`claude-sonnet-5` default) — vision extraction of invoices; market-price estimation. All calls server-side.
- **Tailwind CSS + shadcn/ui** — component styling. **TanStack Table** — catalog table (filter/sort/inline edit).
- Long-running extraction handled as a background job (DB-status polling in v1; queue service only if needed later).

## 9. Explicitly out of scope for v1

- Sales/POS data, revenue tracking, and revenue-based sorting.
- Approval workflows, user roles/permissions.
- Accounting exports (QuickBooks/Xero/CSV).
- Payment tracking, due dates, reminders.
- Market-price lookup via external barcode/pricing APIs (LLM estimate only in v1).
- Native mobile app (responsive web covers phone capture).
- Multi-business/multi-tenant switching per user.

## 10. Success criteria for v1

- A 20-line supplier invoice photo goes from upload to confirmed catalog entries in under 2 minutes including review.
- Catalog filter/sort interactions feel instant (<100 ms) at 5,000 products.
- A re-uploaded invoice is caught by duplicate detection.
- Every price shown can be traced: cost → invoice line → invoice image.
