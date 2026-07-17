-- Session 3: spend guardrails & quotas (SPEC-SAAS §4, §9.3). Invoice volume is
-- the cost driver — every plan carries a monthly invoice cap enforced at the API
-- boundary BEFORE any Claude call. Plus a global kill switch, per-tenant rate
-- limits, and idempotency keys so a retried request never double-spends.

-- Plan catalog. Limits are placeholders (SPEC §4) — tuned from real usage, not
-- guessed. Unlimited is a large integer, never null, so the quota math stays a
-- plain integer comparison.
create table public.plan (
  id text primary key,
  name text not null,
  monthly_invoice_quota integer not null check (monthly_invoice_quota >= 0),
  seat_quota integer check (seat_quota is null or seat_quota >= 0),
  storage_bytes_quota bigint not null check (storage_bytes_quota >= 0),
  market_refresh_quota integer not null check (market_refresh_quota >= 0),
  sort_order integer not null default 0
);

insert into public.plan
  (id, name, monthly_invoice_quota, seat_quota, storage_bytes_quota, market_refresh_quota, sort_order)
values
  ('trial',   'Trial',          20,      2, 1073741824,   50, 0),
  ('starter', 'Starter',        50,      2, 1073741824,  200, 1),
  ('growth',  'Growth',        250,      8, 5368709120, 1000, 2),
  ('pro',     'Pro',          1000,   null, 21474836480, 5000, 3);

-- A business's plan + trial state. Session 5 (billing) owns the transitions;
-- this session only reads them to gate spend. 'trialing' with an elapsed
-- trial_ends_at is graceful read-only: catalog stays, new extractions stop.
alter table public.business
  add column plan_id text not null default 'trial' references public.plan (id),
  add column trial_ends_at timestamptz not null default (now() + interval '14 days'),
  add column subscription_status text not null default 'trialing'
    check (subscription_status in ('trialing', 'active', 'past_due', 'canceled'));

-- Count manual market-price refreshes against the per-plan cap (extraction is
-- already counted by invoices_processed in the metering migration).
alter table public.tenant_usage_period
  add column market_refreshes integer not null default 0;

-- Global kill switch: a single row an operator flips to halt ALL Claude spend
-- across every tenant in an emergency. Service-role only.
create table public.platform_setting (
  id boolean primary key default true check (id),
  claude_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.platform_setting (id) values (true);

-- Idempotency keys (SPEC-SAAS §9.3): a retried POST with the same key returns
-- the first response instead of doing the work — and paying — twice. Scoped per
-- tenant; the stored response is replayed on conflict.
create table public.idempotency_key (
  business_id uuid not null references public.business (id) on delete cascade,
  key text not null,
  operation text not null,
  response jsonb,
  created_at timestamptz not null default now(),
  primary key (business_id, key)
);

-- Fixed-window per-tenant rate limiting for the Claude-calling endpoints, so a
-- runaway client can't burn a month's quota in a minute. Service-role only.
create table public.rate_limit_counter (
  business_id uuid not null references public.business (id) on delete cascade,
  bucket text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (business_id, bucket, window_start)
);

alter table public.plan enable row level security;
alter table public.platform_setting enable row level security;
alter table public.idempotency_key enable row level security;
alter table public.rate_limit_counter enable row level security;

-- The plan catalog is readable by any signed-in user (pricing / current plan).
create policy plan_select on public.plan
  for select using (auth.uid() is not null);
-- platform_setting / idempotency_key / rate_limit_counter carry no policy:
-- only the service-role guardrail path touches them.

/**
 * Atomically bump a fixed-window rate-limit counter and return the new count.
 * The caller compares it to the endpoint's limit. Window boundaries are aligned
 * to the epoch so all callers in a window share one row.
 */
create function public.bump_rate_limit(
  p_business_id uuid,
  p_bucket text,
  p_window_seconds integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz :=
    to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  new_count integer;
begin
  insert into public.rate_limit_counter (business_id, bucket, window_start, count)
  values (p_business_id, p_bucket, v_window_start, 1)
  on conflict (business_id, bucket, window_start) do update set
    count = public.rate_limit_counter.count + 1
  returning count into new_count;
  return new_count;
end;
$$;

-- Roll the market-refresh counter forward too (extraction still bumps the
-- invoice count). Replaces the metering-migration definition in place.
create or replace function public.record_usage_event(
  p_business_id uuid,
  p_user_id uuid,
  p_operation public.usage_operation,
  p_model text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_cost_micro_usd bigint,
  p_invoice_id uuid,
  p_invoices integer,
  p_line_items integer,
  p_storage_bytes bigint
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  event_id uuid;
  current_period text := to_char(now() at time zone 'utc', 'YYYY-MM');
begin
  insert into public.usage_events (
    business_id, user_id, operation, model, input_tokens, output_tokens,
    cost_micro_usd, invoice_id
  ) values (
    p_business_id, p_user_id, p_operation, p_model, p_input_tokens,
    p_output_tokens, p_cost_micro_usd, p_invoice_id
  )
  returning id into event_id;

  insert into public.tenant_usage_period (
    business_id, period, invoices_processed, line_items_extracted,
    storage_bytes, market_refreshes
  ) values (
    p_business_id,
    current_period,
    coalesce(p_invoices, 0),
    coalesce(p_line_items, 0),
    coalesce(p_storage_bytes, 0),
    case when p_operation = 'market_pricing' then 1 else 0 end
  )
  on conflict (business_id, period) do update set
    invoices_processed =
      public.tenant_usage_period.invoices_processed + excluded.invoices_processed,
    line_items_extracted =
      public.tenant_usage_period.line_items_extracted + excluded.line_items_extracted,
    storage_bytes =
      public.tenant_usage_period.storage_bytes + excluded.storage_bytes,
    market_refreshes =
      public.tenant_usage_period.market_refreshes + excluded.market_refreshes,
    updated_at = now();

  return event_id;
end;
$$;
