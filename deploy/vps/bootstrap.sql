-- Instancia NUEVA: identidad y tablas iniciales ausentes del histórico del repo.
create extension if not exists pgcrypto;
create extension if not exists unaccent;
create schema if not exists auth;
create schema if not exists app_private;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(), email text not null unique,
  encrypted_password text not null, email_confirmed_at timestamptz,
  raw_user_meta_data jsonb not null default '{}', raw_app_meta_data jsonb not null default '{}',
  token_version integer not null default 0, disabled boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists auth.sessions (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique, expires_at timestamptz not null, revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists app_private.files (
  id uuid primary key, bucket text not null, name text not null,
  owner_id uuid references auth.users(id) on delete set null,
  mime text not null, size bigint not null, created_at timestamptz not null default now(), unique(bucket,name)
);
create table if not exists app_private.migrations(name text primary key, sha256 text not null, applied_at timestamptz not null default now());
create or replace function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;
create or replace function auth.role() returns text language sql stable as $$ select auth.jwt()->>'role' $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.jwt(),auth.uid(),auth.role() to anon,authenticated,service_role;
create table if not exists public.companies (
  id text primary key, name text not null, slug text unique, email text,
  objectives jsonb default '{}', created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.reports (
  id text primary key, company_id text not null references public.companies(id) on delete cascade,
  period text, data jsonb not null default '{}', created_at timestamptz default now()
);
create table if not exists public.expertise_documents (
  id uuid primary key default gen_random_uuid(), title text not null, content text,
  source_type text, category text, file_name text, created_at timestamptz default now()
);
create or replace function public.is_team_member() returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
begin return exists(select 1 from public.team_members where id=auth.uid()); end $$;
create or replace function public.is_team_admin() returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
begin return exists(select 1 from public.team_members where id=auth.uid() and role in ('admin','member')); end $$;
do $$ begin if not exists(select 1 from pg_publication where pubname='inforce_changes') then create publication inforce_changes; end if; end $$;
