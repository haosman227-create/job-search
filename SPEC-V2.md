# SPEC-V2 — Margin: the 2026 MarginEdge competitor

This supersedes the go-to-market framing of SPEC-SAAS.md. The engine built in
Sessions 1–8 (invoice photo → AI extraction → cost catalog → margins, with
metering, quotas, billing, audit) **is the core of this product** and is kept.
What changes: who it's for, how it looks, and where it runs.

## 1. The target

**MarginEdge** is the incumbent back-office platform for restaurants: invoice
processing, food-cost tracking, recipe costing, budgets, bill pay.

Their structural weaknesses (2026):

| MarginEdge | Margin (us) |
|---|---|
| Invoice processing takes **24–48 hours** — humans review every invoice | **Seconds** — Claude vision extraction, already live in this codebase |
| **~$330/month per location**, no self-serve, demo-gated | **$29 / $79 / $199**, self-serve, 14-day no-card trial (already built) |
| Dense, 2015-era enterprise UI; steep onboarding | Numbers-first, near-wordless, animated UI (V2-1) |
| Reactive reports you must go read | **Proactive AI**: price-spike alerts, margin-hit warnings, weekly digest (V2-2) |
| Web-first; mobile app is a capture accessory | **Mobile-first**: the phone app is the primary capture + awareness surface (V2-4) |

Positioning line: *"Your invoice becomes your food cost — in seconds, not
days."*

## 2. Who it's for

Independent restaurants, cafés, bars, and food retailers (1–10 locations).
The buyer is the owner/operator; the daily user is whoever receives deliveries.
Both are busy, non-technical, and allergic to dense software.

## 3. Design language — "calm futurism" (governs all V2 UI)

- **Numbers first.** Every screen leads with the one number that matters
  (today's food cost %, margin at risk, spend this week). Words are labels,
  never paragraphs. Max ~7 words for any heading.
- **Dark graphite base, one electric accent** (used only for signal: alerts,
  deltas, CTAs). Light mode derived, not primary.
- **Glass panels + depth**, generous whitespace, large friendly type.
- **Motion** (the library) for micro-animation: numbers count up, cards enter
  with stagger, state changes glide. Animation communicates, never decorates
  for its own sake; every effect < 400ms; reduced-motion respected.
- **One action per screen** on mobile; progressive disclosure everywhere.
  If a screen needs explanation, the screen is wrong.

## 4. Stack ruling (vs. the Codex proposal)

Adopted: TypeScript everywhere · Next.js 16 + React 19 · Tailwind v4 ·
shadcn/ui · **Motion** (new) · **React Native + Expo** (new, mobile) ·
PostgreSQL (via Supabase) · Playwright + Vitest · structured JSON logs
(OTel/Sentry-compatible shape, already in).

Deferred with reasons — revisit at real scale, funded by revenue:
- **Go backend / ConnectRPC**: a second language and a service split buys zero
  user-visible value pre-revenue and doubles maintenance. The TS monolith with
  the versioned `/api/v1` is why the mobile app is cheap to build.
- **AWS ECS / RDS / SQS / Redis**: Supabase + Vercel already provide DB, auth,
  storage, background execution, and CDN with near-zero ops. Queues/caches
  arrive when a measured bottleneck exists, not before.

## 5. Build order (one focused session per line, PR + green CI each)

> **Status: V2-0 (#29), V2-1 (#30), V2-2 (#31), V2-3 (#32), V2-4 (#33), and
> V2-5 are shipped.** Deferred, in order of value: AI menu import (photo →
> draft recipes), secure mobile session persistence, EAS store submission
> (owner accounts required).

- **V2-1 — The face.** Design tokens + component pass (Motion), numbers-first
  dashboard (food cost %, spend, margin-at-risk, activity feed), rebuilt
  catalog/invoice/review screens under the design language, public landing
  page that sells against MarginEdge. Proof: screenshots.
- **V2-2 — The brain.** Price intelligence engine (pure + tested): per-product
  price-change detection from invoice history, margin-impact ranking, an
  insights feed ("Mozzarella +14% this week — $312/mo margin hit at current
  menu prices"), weekly AI digest. Insights surface on dashboard + API.
- **V2-3 — Recipes & menu.** Recipe = ingredients (catalog products) +
  quantities → live plate cost, margin per menu item, re-costed automatically
  when an invoice changes an ingredient price. MarginEdge parity feature, done
  simpler. (AI menu import — photograph a menu, get draft recipes — deferred
  until after V2-5 to keep the session focused.)
- **V2-4 — The phone.** Expo app consuming `/api/v1` (Bearer auth built in
  S1): camera-first capture, live extraction status, insights feed, food-cost
  glance. Preview via react-native-web screenshots; store submission requires
  the owner's Apple/Google accounts.
- **V2-5 — The pitch.** Pricing page vs MarginEdge, onboarding polish, demo
  seed data, final report.

## 6. Constraints (unchanged)

Money is integer cents. Every Claude call metered + quota-checked at the
chokepoint. `/api/v1` stays the single logic surface for web and mobile.
Tenant scoping at the boundary, RLS + column grants as backstop. All existing
tests stay green; each session adds its own. One PR per session, merged on
green CI (checks + db + e2e).
