-- V2-3: recipe & menu costing (SPEC-V2 §5). A recipe is a menu item priced in
-- integer cents whose ingredients are catalog products; plate cost is always
-- recomputed from the LIVE catalog costs, so an invoice that moves an
-- ingredient price automatically re-costs every plate that uses it.

create table public.recipe (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business (id) on delete cascade,
  name text not null,
  -- What the item sells for on the menu; null while drafting.
  menu_price_cents integer check (menu_price_cents is null or menu_price_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Composite uniques let child rows carry composite FKs, making a cross-tenant
-- reference impossible at the schema level (audit lesson: never rely on the
-- app layer alone for tenant isolation).
alter table public.recipe add constraint recipe_id_business_unique unique (id, business_id);
alter table public.product add constraint product_id_business_unique unique (id, business_id);

create table public.recipe_ingredient (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business (id) on delete cascade,
  recipe_id uuid not null,
  product_id uuid not null,
  -- Units of the catalog product per plate; fractional allowed (0.25 kg).
  quantity numeric(12, 3) not null check (quantity > 0),
  created_at timestamptz not null default now(),
  -- Composite FKs: the recipe AND the product must belong to the same tenant
  -- as the ingredient row itself.
  foreign key (recipe_id, business_id)
    references public.recipe (id, business_id) on delete cascade,
  foreign key (product_id, business_id)
    references public.product (id, business_id) on delete cascade
);

create index recipe_business_idx on public.recipe (business_id);
create index recipe_ingredient_recipe_idx on public.recipe_ingredient (recipe_id);

alter table public.recipe enable row level security;
alter table public.recipe_ingredient enable row level security;

create policy recipe_all on public.recipe
  for all using (business_id = public.current_business_id())
  with check (business_id = public.current_business_id());

create policy recipe_ingredient_all on public.recipe_ingredient
  for all using (business_id = public.current_business_id())
  with check (business_id = public.current_business_id());
