-- Phase 1: row-level security. Every row is scoped to the caller's business
-- via their membership row (CLAUDE.md: all tables behind RLS scoped to business).

-- The caller's business, derived from JWT identity. SECURITY DEFINER so it can
-- read membership even though membership itself is RLS-protected.
create function public.current_business_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select business_id from public.membership where user_id = auth.uid()
$$;

alter table public.business enable row level security;
alter table public.membership enable row level security;
alter table public.department enable row level security;
alter table public.vendor enable row level security;
alter table public.product enable row level security;
alter table public.invoice enable row level security;
alter table public.invoice_line enable row level security;

-- business: members can see and rename their own workspace. Creation happens
-- through a SECURITY DEFINER signup RPC (Phase 2), not direct insert.
create policy business_select on public.business
  for select using (id = public.current_business_id());
create policy business_update on public.business
  for update using (id = public.current_business_id())
  with check (id = public.current_business_id());

-- membership: visible to everyone in the same business (member lists in
-- Settings); managed by signup/invite RPCs, not direct writes.
create policy membership_select on public.membership
  for select using (business_id = public.current_business_id());

-- All remaining tables: full CRUD within your own business, nothing outside it.
create policy department_all on public.department
  for all using (business_id = public.current_business_id())
  with check (business_id = public.current_business_id());

create policy vendor_all on public.vendor
  for all using (business_id = public.current_business_id())
  with check (business_id = public.current_business_id());

create policy product_all on public.product
  for all using (business_id = public.current_business_id())
  with check (business_id = public.current_business_id());

create policy invoice_all on public.invoice
  for all using (business_id = public.current_business_id())
  with check (business_id = public.current_business_id());

create policy invoice_line_all on public.invoice_line
  for all using (business_id = public.current_business_id())
  with check (business_id = public.current_business_id());
