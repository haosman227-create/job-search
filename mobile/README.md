# Margin mobile (Expo)

The stockroom companion app (SPEC-V2 V2-4): snap a supplier invoice, watch
costs land in seconds, keep an eye on price moves. It consumes the **same
`/api/v1`** as the web dashboard — no mobile-only backend.

## Run it

```bash
cd mobile
npm install
# Point the app at your deployment + Supabase project:
#   edit src/config.ts (appUrl, supabaseUrl, supabaseAnonKey — public values only)
npx expo start        # scan the QR with Expo Go on your phone
```

For local development set `appUrl` to your machine's LAN address running the
web app (`npm run dev` at the repo root), e.g. `http://192.168.1.20:3000`.

## What's here

- `App.tsx` — three-tab shell (Today / Snap / Invoices), dependency-light by
  design (no navigation library in v1).
- `src/lib/api-core.ts` — pure request builders/parsers, **unit-tested from
  the repo's root test suite** (`mobile/src/lib/api-core.test.ts`).
- `src/lib/client.ts` — fetch wrapper: Supabase password sign-in → Bearer
  calls; uploads carry an `Idempotency-Key`, so a flaky stockroom connection
  can retry without paying for extraction twice.
- `src/screens/` — SignIn, Today (quota + price watch), Snap (camera →
  upload), Invoices (live extraction status, polls while processing).

## Notes

- Token is held in memory for v1 (sign in again after an app restart);
  secure persistence lands with the store release.
- Store submission (EAS build, Apple/Google accounts) is owner-side; the
  `app.json` bundle ids are placeholders to change before submitting.
- This package is intentionally NOT part of the root lint/typecheck/build —
  its native deps install here (`npm install`) only when you work on it.
