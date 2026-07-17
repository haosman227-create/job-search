# API v1

The versioned HTTP surface every client uses — the web dashboard today, the
native mobile client later (SPEC-SAAS §9.1). There is exactly one path through
the logic: the service layer in `src/lib/api/services/*`. Route handlers under
`/api/v1/` are thin HTTP adapters over those services; the dashboard's client
components call these endpoints for **every mutation**, and its server-rendered
pages call the **same service functions** the GET endpoints wrap (same logic
path, minus a loopback HTTP hop).

## Authentication

Auth is Supabase-native — there is no bespoke token endpoint:

- **Native / external clients:** authenticate with the Supabase client SDK
  (email/password), then send the access token on every request:
  `Authorization: Bearer <supabase JWT>`.
- **Web dashboard:** the same Supabase session carried by cookies.

Either way, the server resolves the caller's user and tenant (`business`)
membership. **Every endpoint enforces tenant scoping at the boundary** from the
authenticated identity; row-level security on the caller-scoped client is the
backstop, never the only check.

Auth failures: `401 unauthorized` (no/invalid credentials), `403 no_workspace`
(valid user with no tenant membership).

## Error envelope

Every non-2xx response has this shape:

```json
{ "error": { "code": "string", "message": "human readable", "details": { } } }
```

| Code | Status | Meaning |
|---|---|---|
| `unauthorized` | 401 | No or invalid credentials |
| `no_workspace` | 403 | Authenticated but no tenant membership |
| `not_found` | 404 | Resource doesn't exist **in the caller's tenant** |
| `duplicate_invoice` | 409 | Duplicate guard fired; `details.existingInvoiceId` set |
| `invalid_state` | 409 | Operation not valid for the resource's current state |
| `validation_failed` | 422 | Body/params failed validation |
| `quota_exceeded` | 402 | Over a plan cap or trial ended; `details.reason` ∈ `invoice_quota`/`market_quota`/`trial_ended`/`subscription_inactive`, with `limit`/`used` on a cap. Client shows the upgrade path |
| `rate_limited` | 429 | Too many requests this window; `details.retryAfterSeconds` set |
| `service_unavailable` | 503 | Global kill switch off (all Claude spend paused); `details.reason: service_disabled` |
| `internal_error` | 500 | Unexpected failure (details never leaked) |

Spend guardrails (SPEC-SAAS §9.3) are enforced **before** any Claude call. On the
Claude-calling endpoints (`POST /api/v1/invoices`, `POST /api/v1/products/:id/market-refresh`)
the boundary checks, in order: per-tenant rate limit → global kill switch →
subscription/trial state → the plan's monthly cap. Any of these returns a 402/429/503
before the paid work starts.

## Endpoints

### Bootstrap
| Method & path | Purpose |
|---|---|
| `GET /api/v1/me` | Caller's user id + tenant (`{ userId, business: { id, name } }`) |
| `GET /api/v1/usage` | Plan + this month's usage: `{ usage: { plan, subscriptionStatus, trialEndsAt, period, invoices: { used, limit, remaining }, marketRefreshes: {...} } }` |
| `GET /api/v1/onboarding` | First-run checklist + trial status: `{ onboarding, trial }` |

### Account & data rights
| Method & path | Purpose |
|---|---|
| `GET /api/v1/account` | Data-rights status: `{ deletion: { pending, daysRemaining, … }, imageRetentionDays }` |
| `GET /api/v1/account/export` | Full-tenant data export as a downloadable JSON bundle (business, departments, vendors, products, invoices, lines, audit) |
| `POST /api/v1/account/deletion` | Request account deletion — starts a 30-day grace period → `{ deletion }` |
| `DELETE /api/v1/account/deletion` | Cancel a pending deletion within the grace period |
| `PATCH /api/v1/account/retention` | `{ retentionDays: int>0 \| null }` — invoice-image retention window (null = keep until deletion) |

### Billing
| Method & path | Purpose |
|---|---|
| `POST /api/v1/billing/checkout` | `{ planId: "starter"\|"growth"\|"pro" }` → `{ url }` Stripe Checkout session. `503` when billing isn't configured |
| `POST /api/v1/billing/portal` | → `{ url }` Stripe Billing Portal; `409 invalid_state` before a subscription exists |
| `POST /api/v1/billing/webhook` | Stripe → app. Signature-verified (raw body), idempotent by event id. Not tenant-authenticated; never call from a client |

Stripe is the source of truth for paid status. Verified webhooks flip
`business.plan_id` / `subscription_status`, which the Session 3 guardrail then
enforces. Secrets and Price ids live only in the deploy env.

### Invoices
| Method & path | Purpose |
|---|---|
| `GET /api/v1/invoices` | List invoices (vendor name, line count, status), newest first |
| `POST /api/v1/invoices` | Upload one invoice — multipart, field `file` (photo/PDF ≤ 20 MB). `201 { invoiceId }`. Extraction runs in the background. Optional `Idempotency-Key` header replays the first result on retry. Spend-guarded (see error envelope) |
| `GET /api/v1/invoices/:id` | Detail: invoice + lines (with per-field confidence) + signed file URLs |
| `GET /api/v1/invoices/:id/status` | Poll target while extraction runs (`{ status }`) |
| `POST /api/v1/invoices/:id/confirm` | Review submission (the confirm payload). `200` on merge; `409 duplicate_invoice` unless resent with `overrideDuplicate: true` |

Confirm body: `confirmInvoiceSchema` (`src/lib/catalog/confirm-schema.ts`) —
vendor/number/date/total plus the reviewed lines; `invoiceId` comes from the
URL and wins over any body value.

### Catalog
| Method & path | Purpose |
|---|---|
| `GET /api/v1/catalog` | `{ rows, departments, vendors }` — computed rows (margin, effective price, badges) |
| `PATCH /api/v1/products/:id` | `{ salePriceOverrideCents?: int\|null, departmentId?: uuid\|null }` — set/clear the manual price override and/or department (at least one key required) |
| `POST /api/v1/products/:id/barcode` | `{ barcode }` — attach; merges into an existing barcoded twin (returns `attached` or `merged`) |
| `POST /api/v1/products/:id/market-refresh` | Manual AI market-price refresh. Spend-guarded (rate limit + market-refresh quota) |

### Settings
| Method & path | Purpose |
|---|---|
| `GET /api/v1/departments` | List with markup + display order |
| `POST /api/v1/departments` | `{ name, targetMarkup }` → `201 { id }` |
| `PATCH /api/v1/departments/:id` | `{ name, targetMarkup, displayOrder }` |
| `DELETE /api/v1/departments/:id` | Delete; products fall back to Unassigned |
| `GET /api/v1/business` | Tenant profile |
| `PATCH /api/v1/business` | `{ name }` |
| `POST /api/v1/invites` | `{ email }` — email invite into the caller's tenant |

## Observability & audit

Every meaningful mutation (invoice confirm, price override, department CRUD,
barcode attach, business profile, invite, billing changes) writes an
append-only `audit_log` row — service-role only, tenant-readable, never
mutated. Recording is best-effort (a failed audit write never fails the
mutation) but surfaced via a structured JSON log. The operator audit-trail view
lives at `/internal/audit` (env-gated by `INTERNAL_METRICS_ENABLED`), filterable
by `?business=` and `?since=`. Unhandled API errors are logged as structured
JSON with request context; clients still get only a generic `internal_error`.

## Conventions

- Money is integer cents in every request and response. Markup is a decimal
  fraction (0.30 = 30%).
- All ids are UUIDs; invalid ids are `422`, ids outside the caller's tenant are
  `404` (existence is never revealed across tenants).
- Uploads are `multipart/form-data`; everything else is JSON.
- Domain rules (pricing, identity, duplicate detection) live in
  `src/lib/domain` and are the single source of truth beneath the services.
