-- Phase 2: first sign-up creates the business workspace atomically.
-- The signup form passes business_name in the user metadata; this trigger
-- runs inside the same transaction as the auth.users insert, so a user can
-- never exist half-onboarded. Invited users (Phase 10) carry no
-- business_name and get their membership from the invite flow instead.

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  biz_name text := new.raw_user_meta_data ->> 'business_name';
  biz_id uuid;
begin
  if biz_name is not null and btrim(biz_name) <> '' then
    insert into public.business (name) values (btrim(biz_name))
    returning id into biz_id;
    insert into public.membership (user_id, business_id)
    values (new.id, biz_id);
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
