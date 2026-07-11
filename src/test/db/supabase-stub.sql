-- Test-only stand-in for the parts of a real Supabase instance our migrations
-- touch, so they can run on vanilla Postgres (local dev + CI service container).
-- Never applied to a real Supabase project.

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  email text
);

-- Supabase resolves auth.uid() from the request JWT; the stub reads the same
-- claim from a session GUC that tests set via set_config().
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create schema if not exists storage;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid
);

alter table storage.objects enable row level security;

-- Matches Supabase's storage.foldername(): path segments minus the filename.
create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select (string_to_array(name, '/'))[1 : array_length(string_to_array(name, '/'), 1) - 1]
$$;

-- The role PostgREST uses for logged-in requests.
do $$
begin
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end
$$;

grant usage on schema public, auth, storage to authenticated;
alter default privileges in schema public
  grant all on tables to authenticated;
alter default privileges in schema public
  grant execute on functions to authenticated;
grant select on auth.users to authenticated;
grant select on storage.buckets to authenticated;
grant all on storage.objects to authenticated;
