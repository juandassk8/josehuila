-- =========================================================
-- INFORCE — Client auth schema
-- Vincula usuarios de Supabase Auth con empresas.
-- Corre esto en Supabase SQL editor.
-- =========================================================

-- 1. client_users ----------------------------------------
-- Relación N:M entre usuarios de auth y empresas.
-- Una empresa puede tener varios usuarios (empleados del cliente).
-- Un usuario pertenece a una o más empresas (normalmente una).
create table if not exists public.client_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id text not null,
  role text not null default 'viewer' check (role in ('owner', 'viewer')),
  created_at timestamptz not null default now(),
  unique (user_id, company_id)
);
create index if not exists client_users_company_idx on public.client_users(company_id);
create index if not exists client_users_user_idx on public.client_users(user_id);

-- 2. Código de registro por empresa --------------------
-- Cada empresa tiene un código único que el cliente debe usar para registrarse.
alter table public.companies
  add column if not exists registration_code text;

create unique index if not exists companies_registration_code_idx
  on public.companies(registration_code)
  where registration_code is not null;

-- Helper: genera un código legible (ej: "WAKE-UP-7K3F") a partir del slug.
create or replace function public.generate_company_code(slug text)
returns text as $$
declare
  base text;
  suffix text;
  tries int := 0;
  candidate text;
begin
  base := upper(regexp_replace(coalesce(slug, 'EMP'), '[^a-zA-Z0-9]+', '-', 'g'));
  base := substring(base from 1 for 12);
  loop
    suffix := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 4));
    candidate := base || '-' || suffix;
    exit when not exists (select 1 from public.companies where registration_code = candidate);
    tries := tries + 1;
    if tries > 10 then exit; end if;
  end loop;
  return candidate;
end;
$$ language plpgsql;

-- 3. RLS --------------------------------------------------
alter table public.client_users enable row level security;

drop policy if exists "authenticated read own" on public.client_users;
drop policy if exists "admin manage all" on public.client_users;

-- Un usuario autenticado puede ver sus propias filas (para saber a qué empresas pertenece).
create policy "authenticated read own" on public.client_users
  for select to authenticated using (user_id = auth.uid());

-- Admin (service_role o insert manual) gestiona todo.
create policy "admin manage all" on public.client_users
  for all to authenticated using (true) with check (true);
