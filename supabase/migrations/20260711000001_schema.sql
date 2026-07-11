-- Phase 1: core schema (SPEC §6).
-- Money is always integer cents; margins/markups are decimals.
-- Every business-scoped table carries business_id for RLS (see next migration).

create extension if not exists pgcrypto;

create table public.business (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- One business per user in v1 (SPEC §2, §9: no multi-business switching).
create table public.membership (
  user_id uuid primary key references auth.users (id) on delete cascade,
  business_id uuid not null references public.business (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index membership_business_id_idx on public.membership (business_id);

create table public.department (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business (id) on delete cascade,
  name text not null,
  -- Target markup as a decimal fraction, e.g. 0.30 = 30%.
  target_markup numeric(6, 4) not null default 0.30
    check (target_markup >= 0),
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (business_id, name)
);

create table public.vendor (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business (id) on delete cascade,
  name text not null,
  -- Dedup key: lowercased, whitespace/punctuation-normalized name.
  normalized_name text not null,
  created_at timestamptz not null default now(),
  unique (business_id, normalized_name)
);

create table public.product (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business (id) on delete cascade,
  vendor_id uuid references public.vendor (id),
  barcode text,
  name text not null,
  normalized_name text not null,
  department_id uuid references public.department (id),
  -- 0..1 confidence of the AI department assignment; null = manually set.
  department_confidence numeric(4, 3)
    check (department_confidence between 0 and 1),
  -- Denormalized from the latest confirmed invoice line (history in invoice_line).
  current_cost_cents integer check (current_cost_cents >= 0),
  -- Previous cost, kept to show the cost-increase indicator (SPEC §5.1).
  previous_cost_cents integer check (previous_cost_cents >= 0),
  market_price_cents integer check (market_price_cents >= 0),
  market_price_fetched_at timestamptz,
  -- Computed price actually charged: cost x department markup, rounded (SPEC §4).
  sale_price_cents integer check (sale_price_cents >= 0),
  -- Explicit manual override; when set it wins over sale_price_cents until cleared.
  sale_price_override_cents integer check (sale_price_override_cents >= 0),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Product identity (SPEC §6): barcode when present, else vendor + normalized name.
create unique index product_identity_barcode_idx
  on public.product (business_id, barcode)
  where barcode is not null;

create unique index product_identity_name_idx
  on public.product (business_id, vendor_id, normalized_name)
  where barcode is null;

create index product_department_id_idx on public.product (department_id);
create index product_vendor_id_idx on public.product (vendor_id);

create type public.invoice_status as enum (
  'processing',
  'needs_review',
  'partial',
  'confirmed',
  'failed'
);

create table public.invoice (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business (id) on delete cascade,
  vendor_id uuid references public.vendor (id),
  invoice_number text,
  invoice_date date,
  total_cents integer check (total_cents >= 0),
  status public.invoice_status not null default 'processing',
  uploaded_by uuid references auth.users (id),
  -- Paths of the source image/PDF objects in the 'invoices' storage bucket.
  file_paths text[] not null default '{}',
  extraction_model text,
  extraction_confidence numeric(4, 3)
    check (extraction_confidence between 0 and 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index invoice_business_id_idx on public.invoice (business_id);
create index invoice_vendor_id_idx on public.invoice (vendor_id);
-- Duplicate detection lookup (SPEC §7.1): vendor + invoice number + total.
create index invoice_duplicate_idx
  on public.invoice (business_id, vendor_id, invoice_number, total_cents);

-- This table IS the cost history (SPEC §6): a product's cost trend over time.
create table public.invoice_line (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business (id) on delete cascade,
  invoice_id uuid not null references public.invoice (id) on delete cascade,
  product_id uuid references public.product (id),
  raw_text text,
  barcode text,
  name text,
  quantity numeric(12, 3) check (quantity >= 0),
  unit_cost_cents integer check (unit_cost_cents >= 0),
  line_total_cents integer check (line_total_cents >= 0),
  -- Per-field 0..1 confidences keyed by field name, from extraction.
  confidence jsonb not null default '{}'::jsonb,
  illegible boolean not null default false,
  created_at timestamptz not null default now()
);

create index invoice_line_invoice_id_idx on public.invoice_line (invoice_id);
create index invoice_line_product_id_idx on public.invoice_line (product_id);

-- Seed the default department set for every new business (SPEC §6).
create function public.seed_default_departments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.department (business_id, name, target_markup, display_order)
  values
    (new.id, 'Grocery', 0.30, 1),
    (new.id, 'Beverages', 0.35, 2),
    (new.id, 'Snacks', 0.40, 3),
    (new.id, 'Dairy', 0.25, 4),
    (new.id, 'Frozen', 0.30, 5),
    (new.id, 'Household', 0.35, 6),
    (new.id, 'Health & Beauty', 0.40, 7),
    (new.id, 'Tobacco', 0.12, 8),
    (new.id, 'Other', 0.30, 99);
  return new;
end;
$$;

create trigger business_seed_departments
  after insert on public.business
  for each row execute function public.seed_default_departments();
