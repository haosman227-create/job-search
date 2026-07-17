-- Session 2: usage metering & cost attribution (SPEC-SAAS §9.2). Claude vision
-- extraction is this product's cost of goods sold; nothing bills without a
-- recorded usage event. Two append-only surfaces + one atomic write-path
-- primitive that records the event and bumps the tenant's period counters.

create type public.usage_operation as enum ('extraction', 'market_pricing');

-- One row per Claude call. Append-only from the application path: RLS lets a
-- tenant read its own events, and no insert/update/delete policy exists, so
-- only the service-role recorder can write (and never mutate) them.
create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business (id) on delete cascade,
  user_id uuid references auth.users (id),
  operation public.usage_operation not null,
  model text not null,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  -- USD cost in integer micro-dollars (millionths of a dollar). Money is never
  -- a float; $0.0123 -> 12300 micro-usd.
  cost_micro_usd bigint not null default 0 check (cost_micro_usd >= 0),
  invoice_id uuid references public.invoice (id) on delete set null,
  created_at timestamptz not null default now()
);

create index usage_events_business_period_idx
  on public.usage_events (business_id, created_at);
create index usage_events_invoice_idx on public.usage_events (invoice_id);

-- Per-tenant, per-billing-period counters (SPEC-SAAS §9.2). Period is the
-- calendar month 'YYYY-MM' in UTC. Quotas (Session 3) read these.
create table public.tenant_usage_period (
  business_id uuid not null references public.business (id) on delete cascade,
  period text not null,
  invoices_processed integer not null default 0,
  line_items_extracted integer not null default 0,
  storage_bytes bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (business_id, period)
);

alter table public.usage_events enable row level security;
alter table public.tenant_usage_period enable row level security;

-- Read-only for the owning tenant; writes go through the service-role
-- recorder only (append-only from the app path).
create policy usage_events_select on public.usage_events
  for select using (business_id = public.current_business_id());
create policy tenant_usage_period_select on public.tenant_usage_period
  for select using (business_id = public.current_business_id());

/**
 * The write-path metering primitive: atomically append a usage event and roll
 * the tenant's period counters forward. Called by the service-role recorder
 * immediately after each Claude call — no call is left unmetered.
 */
create function public.record_usage_event(
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
    business_id, period, invoices_processed, line_items_extracted, storage_bytes
  ) values (
    p_business_id,
    current_period,
    coalesce(p_invoices, 0),
    coalesce(p_line_items, 0),
    coalesce(p_storage_bytes, 0)
  )
  on conflict (business_id, period) do update set
    invoices_processed =
      public.tenant_usage_period.invoices_processed + excluded.invoices_processed,
    line_items_extracted =
      public.tenant_usage_period.line_items_extracted + excluded.line_items_extracted,
    storage_bytes =
      public.tenant_usage_period.storage_bytes + excluded.storage_bytes,
    updated_at = now();

  return event_id;
end;
$$;
