-- Session 5: Stripe billing & plan enforcement (SPEC-SAAS §4, §9.5). Stripe is
-- the source of truth for whether a tenant has paid; signature-verified,
-- idempotent webhooks flip the plan/subscription state the Session 3 guardrail
-- already enforces. Secrets (keys, price ids) live only in the deployment env.

-- Link a tenant to its Stripe customer + subscription so Portal and webhooks
-- can reconcile. Nullable: a tenant on trial has neither yet.
alter table public.business
  add column stripe_customer_id text unique,
  add column stripe_subscription_id text;

-- Monthly list price for display only (integer cents — money is never a float).
-- The real charge is the Stripe Price; this just renders the plan cards. Trial
-- is free.
alter table public.plan add column price_cents integer not null default 0
  check (price_cents >= 0);

update public.plan set price_cents = 2900 where id = 'starter';
update public.plan set price_cents = 7900 where id = 'growth';
update public.plan set price_cents = 19900 where id = 'pro';

-- Webhook idempotency (SPEC-SAAS §9.5): Stripe may deliver an event more than
-- once. We record each event id the first time we process it; a redelivery hits
-- the primary key and is skipped. Service-role only.
create table public.stripe_event (
  id text primary key,
  type text not null,
  business_id uuid references public.business (id) on delete set null,
  received_at timestamptz not null default now()
);

alter table public.stripe_event enable row level security;
-- No policy: only the service-role webhook handler reads or writes this.
