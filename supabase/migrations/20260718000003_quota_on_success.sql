-- P1 audit fix: cost and quota are different facts. The usage event (Claude
-- spend) is recorded the moment the call happens — that money is gone either
-- way. But invoices_processed is the tenant's BILLABLE quota unit, and it was
-- bumped before the invoice rows were written: a failed write still consumed
-- the customer's cap. The counters now roll forward only after the invoice
-- persists, via this dedicated primitive (no usage event — that already
-- exists by then).

create function public.record_invoice_processed(
  p_business_id uuid,
  p_invoices integer,
  p_line_items integer,
  p_storage_bytes bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_period text := to_char(now() at time zone 'utc', 'YYYY-MM');
begin
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
end;
$$;
