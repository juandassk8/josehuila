-- =========================================================
-- INFORCE CENTRAL — Time Tracker personal (categorías + sesiones)
-- Pista de tiempo a nivel "compartimento de vida" (Marca personal,
-- Agencia, Otros…), independiente del timer por-tarea existente.
-- SAFE: idempotente.
-- =========================================================

-- 1. time_tracker_categories ---------------------------------
create table if not exists public.time_tracker_categories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.team_members(id) on delete cascade,
  name text not null,
  color text not null default '#378ADD',
  icon text default '⏱',
  sort_order int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists time_tracker_categories_owner_idx
  on public.time_tracker_categories(owner_id);

-- Único por (owner, nombre case-insensitive) entre las NO archivadas, para
-- permitir reusar el nombre después de archivar.
create unique index if not exists time_tracker_categories_owner_name_unique
  on public.time_tracker_categories(owner_id, lower(name)) where archived = false;

-- 2. time_tracker_sessions -----------------------------------
create table if not exists public.time_tracker_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.team_members(id) on delete cascade,
  category_id uuid not null references public.time_tracker_categories(id) on delete restrict,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds int generated always as (
    case
      when ended_at is null then null
      else greatest(0, extract(epoch from (ended_at - started_at))::int)
    end
  ) stored,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists time_tracker_sessions_owner_started_idx
  on public.time_tracker_sessions(owner_id, started_at desc);

create index if not exists time_tracker_sessions_category_idx
  on public.time_tracker_sessions(category_id);

-- Garantiza una única sesión activa por usuario.
create unique index if not exists time_tracker_sessions_one_active_per_user
  on public.time_tracker_sessions(owner_id) where ended_at is null;

-- 3. updated_at trigger en categorías ------------------------
-- (Reutiliza public.set_updated_at() definida en team_schema.sql)
drop trigger if exists time_tracker_categories_updated_at on public.time_tracker_categories;
create trigger time_tracker_categories_updated_at before update on public.time_tracker_categories
  for each row execute function public.set_updated_at();

-- 4. RLS — permissive para MVP (frontend filtra por owner_id) -
alter table public.time_tracker_categories enable row level security;
alter table public.time_tracker_sessions enable row level security;

drop policy if exists "authenticated all" on public.time_tracker_categories;
drop policy if exists "authenticated all" on public.time_tracker_sessions;

create policy "authenticated all" on public.time_tracker_categories
  for all to authenticated using (true) with check (true);
create policy "authenticated all" on public.time_tracker_sessions
  for all to authenticated using (true) with check (true);

-- 5. Realtime publication ------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.time_tracker_categories;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.time_tracker_sessions;
exception when duplicate_object then null; end $$;

-- 6. RPC switch_time_session ---------------------------------
-- Cierra la sesión activa de p_owner (si la hay) y abre una nueva en
-- p_category, todo en una sola transacción. Devuelve la nueva sesión.
-- El partial unique index garantiza que no queden dos abiertas si dos
-- pestañas hacen switch al mismo tiempo: una de las dos tx falla y el
-- cliente reintenta.
create or replace function public.switch_time_session(
  p_owner uuid,
  p_category uuid
) returns public.time_tracker_sessions
language plpgsql
as $$
declare
  v_new public.time_tracker_sessions;
begin
  update public.time_tracker_sessions
     set ended_at = now()
   where owner_id = p_owner and ended_at is null;

  insert into public.time_tracker_sessions (owner_id, category_id)
       values (p_owner, p_category)
    returning * into v_new;

  return v_new;
end;
$$;

grant execute on function public.switch_time_session(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
