-- Phase 1: private storage bucket for invoice photos/PDFs.
-- Objects live under <business_id>/<invoice_id>/<filename>; the first path
-- segment scopes access the same way business_id does on tables.

insert into storage.buckets (id, name, public)
values ('invoices', 'invoices', false)
on conflict (id) do nothing;

create policy invoices_bucket_select on storage.objects
  for select using (
    bucket_id = 'invoices'
    and (storage.foldername(name))[1] = public.current_business_id()::text
  );

create policy invoices_bucket_insert on storage.objects
  for insert with check (
    bucket_id = 'invoices'
    and (storage.foldername(name))[1] = public.current_business_id()::text
  );

create policy invoices_bucket_update on storage.objects
  for update using (
    bucket_id = 'invoices'
    and (storage.foldername(name))[1] = public.current_business_id()::text
  );

create policy invoices_bucket_delete on storage.objects
  for delete using (
    bucket_id = 'invoices'
    and (storage.foldername(name))[1] = public.current_business_id()::text
  );
