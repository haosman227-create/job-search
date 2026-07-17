-- Session 6: observability & audit log (SPEC-SAAS §6, §9.6). An append-only
-- record of every meaningful mutation, so an operator can reconstruct what
-- happened to a tenant's data during an incident. Invoice images and cost data
-- are sensitive; the trail is how we stay accountable for changes to them.

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business (id) on delete cascade,
  -- Null actor = a system/webhook action (e.g. Stripe-driven plan change).
  actor_user_id uuid references auth.users (id),
  action text not null,
  entity_type text not null,
  entity_id text,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_business_created_idx
  on public.audit_log (business_id, created_at desc);

alter table public.audit_log enable row level security;

-- A tenant can read its own trail (needed for the Session 7 data export); it is
-- append-only from the application path — no insert/update/delete policy, so
-- only the service-role recorder writes, and nothing ever mutates a row.
create policy audit_log_select on public.audit_log
  for select using (business_id = public.current_business_id());
