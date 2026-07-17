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
| `internal_error` | 500 | Unexpected failure (details never leaked) |

## Endpoints

### Bootstrap
| Method & path | Purpose |
|---|---|
| `GET /api/v1/me` | Caller's user id + tenant (`{ userId, business: { id, name } }`) |

### Invoices
| Method & path | Purpose |
|---|---|
| `GET /api/v1/invoices` | List invoices (vendor name, line count, status), newest first |
| `POST /api/v1/invoices` | Upload one invoice — multipart, field `file` (photo/PDF ≤ 20 MB). `201 { invoiceId }`. Extraction runs in the background |
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
| `POST /api/v1/products/:id/market-refresh` | Manual AI market-price refresh |

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

## Conventions

- Money is integer cents in every request and response. Markup is a decimal
  fraction (0.30 = 30%).
- All ids are UUIDs; invalid ids are `422`, ids outside the caller's tenant are
  `404` (existence is never revealed across tenants).
- Uploads are `multipart/form-data`; everything else is JSON.
- Domain rules (pricing, identity, duplicate detection) live in
  `src/lib/domain` and are the single source of truth beneath the services.
