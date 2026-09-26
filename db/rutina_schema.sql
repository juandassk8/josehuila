-- Fase 3 — Mi rutina: bloques de rutina, checks por bloque, hábitos, registro de hábitos y peso.
-- Todo por miembro (owner_id = team_members.id = auth.uid()). Solo CREA tablas nuevas. Idempotente.

create table if not exists public.routine_blocks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.team_members(id) on delete cascade,
  day smallint not null check (day between 0 and 6),          -- 0 = lunes … 6 = domingo
  start_min smallint not null check (start_min between 0 and 1439),
  end_min smallint not null check (end_min between 1 and 1440),
  label text not null,
  category text not null default 'light'
    check (category in ('deep','light','calls','gym','therapy','food','fam','sis','self','other')),
  note text,
  habit_key text,                                             -- hábito que se marca solo al chequear el bloque
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_min > start_min)
);
create index if not exists routine_blocks_owner_day_idx on public.routine_blocks(owner_id, day, start_min);

create table if not exists public.routine_checks (
  owner_id uuid not null references public.team_members(id) on delete cascade,
  block_id uuid not null references public.routine_blocks(id) on delete cascade,
  date date not null,
  value smallint not null check (value in (1, 3)),            -- 1 = lo hice · 3 = no lo hice
  started_at timestamptz,                                     -- cuándo le di "Arrancar"
  updated_at timestamptz not null default now(),
  primary key (block_id, date)
);
create index if not exists routine_checks_owner_date_idx on public.routine_checks(owner_id, date);

create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.team_members(id) on delete cascade,
  key text not null,
  name text not null,
  grp text not null default 'General',
  target smallint not null default 7 check (target between 1 and 7),
  days int[],                                                 -- 7 posiciones L..D (1 = toca); null = todos los días
  sort_order int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (owner_id, key)
);

create table if not exists public.habit_logs (
  habit_id uuid not null references public.habits(id) on delete cascade,
  owner_id uuid not null references public.team_members(id) on delete cascade,
  date date not null,
  value smallint not null check (value in (1, 2, 3)),         -- 1 hecho · 2 a medias · 3 no
  updated_at timestamptz not null default now(),
  primary key (habit_id, date)
);
create index if not exists habit_logs_owner_date_idx on public.habit_logs(owner_id, date);

create table if not exists public.weight_logs (
  owner_id uuid not null references public.team_members(id) on delete cascade,
  date date not null,
  kg numeric(5,2) not null check (kg between 20 and 300),
  updated_at timestamptz not null default now(),
  primary key (owner_id, date)
);

do $$ declare tbl text; begin
  foreach tbl in array array['routine_blocks','routine_checks','habits','habit_logs','weight_logs'] loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_own', tbl);
    execute format(
      'create policy %I on public.%I for all to authenticated using (owner_id = auth.uid() and public.is_team_member()) with check (owner_id = auth.uid() and public.is_team_member())',
      tbl || '_own', tbl);
  end loop;
end $$;

drop trigger if exists routine_blocks_updated_at on public.routine_blocks;
create trigger routine_blocks_updated_at before update on public.routine_blocks
  for each row execute function public.set_updated_at();

notify pgrst, 'reload schema';
