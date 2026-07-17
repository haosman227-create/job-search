-- Session 7: tenant data rights & legal surface (SPEC-SAAS §5, §7). Customers
-- can export all their data and delete their account on their own, with a grace
-- period before the hard delete. Invoice images are sensitive; a per-tenant
-- retention control bounds how long they're kept.

alter table public.business
  -- Self-serve deletion: set when requested, with a grace window before purge.
  -- Cancelling clears both. The hard delete (cascade) runs after purge_after.
  add column deletion_requested_at timestamptz,
  add column purge_after timestamptz,
  -- Per-tenant invoice-image retention in days; null = keep until deletion.
  add column image_retention_days integer
    check (image_retention_days is null or image_retention_days > 0);

-- A tenant marked for deletion is easy to find for the purge job.
create index business_purge_after_idx on public.business (purge_after)
  where purge_after is not null;
