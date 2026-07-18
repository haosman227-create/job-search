-- P0 security: a tenant's JWT must not be able to write its own billing state.
-- RLS is row-level only — the business_update policy correctly scopes WHICH row
-- a member can update, but Supabase's default grants let them update ANY column
-- of it, including plan_id / subscription_status / trial_ends_at. That is a
-- self-serve free upgrade. Column-level privileges close it: tenants keep the
-- columns the product intends them to write (profile name, data-rights fields);
-- billing and Stripe linkage become service-role-only.

revoke update on public.business from authenticated;
grant update (name, deletion_requested_at, purge_after, image_retention_days)
  on public.business to authenticated;
