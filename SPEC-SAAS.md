# SPEC-SAAS — Multi-Tenant Paid Product

**Status:** Direction change approved 2026-07-13. Supersedes the single-business
framing of SPEC.md for all new work. SPEC.md and ACCEPTANCE.md still describe
the v1 application that exists today; this document describes the **delta** to a
sellable B2B SaaS product and the order it gets built in.

## 1. Product direction

The app is no longer a single-business internal tool. It becomes a **multi-tenant
B2B SaaS product** sold to independent grocery and specialty retailers:

- A **web dashboard** (the current Next.js app) is the primary client.
- A **native mobile client** comes later and consumes the **same versioned API** —
  it is gated behind having paying web customers first.
- The first tenant (Minnehaha) becomes tenant zero on the paid platform; its live
  data and auth must never break while this is built.

## 2. What already exists (and carries over unchanged)

The v1 build is already tenant-aware in its bones — this is the reason the
conversion is tractable rather than a rewrite:

- Every table is scoped to a `business` (the tenant) and protected by
  **row-level security**. `business` == tenant throughout.
- Atomic workspace creation on signup, email/password auth (Supabase), shared
  membership per workspace.
- The full invoice loop: upload → Claude vision extraction (background job) →
  side-by-side review → catalog merge with cost history; the TanStack catalog;
  AI market-price estimation; settings (department markups, profile, invites).
- Pure domain logic (money-as-integer-cents, pricing, identity, duplicate
  detection) with 106 unit + 21 integration + 2 e2e tests.

**These are the source of truth and do not get rewritten.** The SaaS work wraps,
meters, and monetizes them.

## 3. The delta (what the paid product adds)

| Area | Today | Paid product |
|---|---|---|
| API | Web UI calls Server Actions directly | Versioned `/api/v1/` HTTP API; web UI consumes it; native client consumes the same |
| Cost visibility | AI spend unmeasured | Per-call usage metering + per-tenant cost attribution |
| Spend safety | None | Per-tenant quotas, global kill switch, rate limits, idempotency |
| Front door | Invite-only | Self-serve signup + onboarding + email verification |
| Money | None | Stripe tiers, trials, plan enforcement at the API boundary |
| Forensics | None | Append-only audit log, structured logging, error tracking |
| Trust/legal | None | Self-serve export + deletion, ToS/Privacy, retention controls |
| Install | Browser only | PWA install; native client (post-revenue) |

## 4. Pricing & packaging

- **Model:** tiered plans, each with a **monthly invoice cap**. Invoice volume is
  the cost driver (each invoice is one or more paid Claude vision calls), so the
  cap is enforced at the API boundary *before* any Claude call.
- **Three tiers:** Starter / Growth / Pro. Every tier is **self-serve** (Stripe
  Checkout). No sales-assisted or Enterprise tier in v1.
- **Per-plan limits:** monthly invoice quota · user seats · storage bytes ·
  market-price refreshes. **Placeholder** starting point below — final numbers are
  set from the Session 2 usage data, not guessed here:

  | Tier | Invoices/mo | Seats | Storage | Notes |
  |---|---|---|---|---|
  | Starter | ~50 | 2 | ~1 GB | Single small store |
  | Growth | ~250 | 8 | ~5 GB | Busy store |
  | Pro | ~1,000 | unlimited | ~20 GB | High volume / multi-location |

- **Trial:** 14 days, **no credit card up front** (protects time-to-first-extraction),
  with a small trial invoice cap (~20) to bound AI spend. At trial end without
  payment: **graceful read-only** — catalog stays viewable, no new extractions,
  **no data deletion**.
- Money stays **integer cents** end to end, including Stripe amounts.

## 5. Tenancy & data isolation guarantees

- **Two layers, always:** every API endpoint enforces tenant scoping from the
  authenticated identity; RLS is the backstop, **never the only check**.
- A cross-tenant access attempt is a test that **must fail** in CI.
- Invoice images and cost data are among the most sensitive data a retailer holds.
  Guarantees to customers: their data is isolated per tenant, exportable in full
  on demand, and deletable in full on demand (grace period before hard delete).
- Invoice images are processed by a third-party AI provider (Anthropic); this is
  disclosed in the Privacy Policy with a per-tenant image-retention control.

## 6. Support / admin access model

- The operator gets an **internal cross-tenant usage view** (cost per tenant per
  month, cost per invoice) and an **audit-trail support view** (given a tenant +
  time range, what happened).
- **No silent impersonation** in v1. Any cross-tenant read of tenant business data
  is itself recorded in the audit log. Full impersonation/support-login is
  deliberately out of scope until there's a support burden that needs it.

## 7. Definition of done — v1 paid product

A new retailer can, entirely self-serve:

1. Sign up and create their tenant workspace, verify email.
2. Complete onboarding and **extract their first invoice within the trial**.
3. Hit a plan cap and see a clear, non-scary upgrade path.
4. **Upgrade via Stripe** and have the new limits enforced at the API.
5. Have every AI call **metered** and every quota **enforced before the call**.
6. **Export** or **delete** all their data on their own.

Plus, for the operator: usage/cost visibility per tenant, a global spend kill
switch, and an audit trail for reconstructing any data incident.

## 8. Explicitly out of scope for v1 paid

- Native mobile client (built only after paying web customers exist — Session 9).
- Sales-assisted / Enterprise tier, custom contracts, SSO/SAML.
- Full support impersonation / login-as-tenant.
- Usage-based overage billing (tiers + hard caps only in v1).
- Annual billing, coupons/promotions, referral programs.
- Multi-currency (USD only; still integer cents).
- Reseller / white-label.

## 9. Build order (one focused change per session)

Sequenced by what blocks charging money or blocks a native client; nothing else
is ahead of those. Each ships as its own PR with tests green, on the SaaS line,
without breaking tenant zero.

1. **Versioned API** (`/api/v1/`) — the web UI and the future native client share
   exactly one path through the logic. *Highest priority.*
2. **Usage metering & cost attribution** — write-path `usage_events` + per-tenant
   counters; unit economics before pricing.
3. **Spend guardrails & quotas** — per-tenant caps enforced pre-call, global kill
   switch, rate limits, idempotency keys.
4. **Self-serve signup & onboarding** — public front door optimizing
   time-to-first-extracted-invoice.
5. **Billing & plan enforcement** — Stripe Checkout + Portal, idempotent
   signature-verified webhooks, trial + graceful degradation.
6. **Observability & audit log** — append-only mutation audit, structured logs,
   error tracking with tenant context.
7. **Tenant data rights & legal surface** — self-serve export + deletion,
   ToS/Privacy placeholders (flagged for legal review), retention controls.
8. **PWA & install experience** — installable dashboard + stockroom-condition
   mobile pass.
9. **Native mobile client** — Expo/RN consuming `/api/v1`, adding native camera,
   offline queue, push, biometrics (post-revenue only).

## 10. Standing constraints (unchanged from the core build)

- Tenant zero's live data and auth never break.
- All existing tests stay green; new work adds tests, never subtracts them.
- Money is never a float.
- Secrets live in the Vercel/Supabase/Stripe dashboards — never in the repo, a
  prompt, or a session.
- Database changes only via checked-in migrations.
