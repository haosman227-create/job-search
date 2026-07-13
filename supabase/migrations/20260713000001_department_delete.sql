-- Phase 10: deleting a department should not be blocked by products that use
-- it — those products fall back to "Unassigned" (SPEC §5.1 allows a null
-- department). Repoint the product.department_id FK to ON DELETE SET NULL.

alter table public.product
  drop constraint product_department_id_fkey,
  add constraint product_department_id_fkey
    foreign key (department_id) references public.department (id)
    on delete set null;
