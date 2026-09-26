-- =========================================================
-- INFORCE CENTRAL — Team module schema v1
-- Run this in Supabase SQL editor (Dashboard → SQL)
-- SAFE: only creates NEW tables. Does not touch companies/reports.
-- =========================================================

-- 1. team_members (extends auth.users) -----------------------
create table if not exists public.team_members (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null check (role in ('admin','member','editor')),
  email text not null unique,
  color text not null default '#378ADD',
  birthday_day smallint check (birthday_day between 1 and 31),
  birthday_month smallint check (birthday_month between 1 and 12),
  phone text,
  bio text,
  preferences jsonb not null default '{}'::jsonb,
  current_task_id uuid,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists team_members_role_idx on public.team_members(role);

-- 2. spaces --------------------------------------------------
create table if not exists public.spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  icon text,
  color text default '#378ADD',
  visibility text not null check (visibility in ('shared','private')) default 'shared',
  owner_id uuid references public.team_members(id) on delete cascade,
  sort_order int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  check (visibility = 'shared' or owner_id is not null)
);
create index if not exists spaces_owner_idx on public.spaces(owner_id);

-- 3. tasks ---------------------------------------------------
do $$ begin
  create type task_status as enum ('pendiente','en_curso','completado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_priority as enum ('urgente','alta','normal','baja');
exception when duplicate_object then null; end $$;

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status task_status not null default 'pendiente',
  priority task_priority not null default 'normal',
  due_date date,
  space_id uuid references public.spaces(id) on delete set null,
  company_id text, -- companies.id is text/timestamp in legacy schema; weak link
  created_by uuid references public.team_members(id) on delete set null,
  completed_at timestamptz,
  completed_by uuid references public.team_members(id) on delete set null,
  sort_order double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (space_id is not null or company_id is not null)
);
create index if not exists tasks_status_idx on public.tasks(status);
create index if not exists tasks_space_idx on public.tasks(space_id);
create index if not exists tasks_company_idx on public.tasks(company_id);
create index if not exists tasks_due_idx on public.tasks(due_date);

-- circular FK: team_members.current_task_id -> tasks.id
do $$ begin
  alter table public.team_members
    add constraint team_members_current_task_fk
    foreign key (current_task_id) references public.tasks(id) on delete set null;
exception when duplicate_object then null; end $$;

-- 4. task_assignees (M2M) ------------------------------------
create table if not exists public.task_assignees (
  task_id uuid references public.tasks(id) on delete cascade,
  member_id uuid references public.team_members(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (task_id, member_id)
);
create index if not exists task_assignees_member_idx on public.task_assignees(member_id);

-- 5. RLS — permissive for MVP, frontend enforces role gating -
alter table public.team_members enable row level security;
alter table public.spaces enable row level security;
alter table public.tasks enable row level security;
alter table public.task_assignees enable row level security;

drop policy if exists "authenticated all" on public.team_members;
drop policy if exists "authenticated all" on public.spaces;
drop policy if exists "authenticated all" on public.tasks;
drop policy if exists "authenticated all" on public.task_assignees;

create policy "authenticated all" on public.team_members
  for all to authenticated using (true) with check (true);
create policy "authenticated all" on public.spaces
  for all to authenticated using (true) with check (true);
create policy "authenticated all" on public.tasks
  for all to authenticated using (true) with check (true);
create policy "authenticated all" on public.task_assignees
  for all to authenticated using (true) with check (true);

-- 6. Realtime publication ------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.tasks;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.team_members;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.task_assignees;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.spaces;
exception when duplicate_object then null; end $$;

-- 7. updated_at trigger --------------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists tasks_updated_at on public.tasks;
create trigger tasks_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();

drop trigger if exists members_updated_at on public.team_members;
create trigger members_updated_at before update on public.team_members
  for each row execute function public.set_updated_at();
