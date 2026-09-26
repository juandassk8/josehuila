-- =========================================================
-- INFORCE CENTRAL — Scorecard module schema v1
-- Run this in Supabase SQL editor (Dashboard → SQL)
-- SAFE: only creates NEW tables. Additive, idempotent.
-- =========================================================

-- 1. scorecard_kpis -----------------------------------------
create table if not exists public.scorecard_kpis (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.team_members(id) on delete cascade,
  category text not null,        -- VELOCIDAD | CALIDAD | PRESION | DATA | custom
  label text not null,
  sort_order int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists scorecard_kpis_member_idx
  on public.scorecard_kpis(member_id) where archived = false;

-- 2. scorecard_entries --------------------------------------
create table if not exists public.scorecard_entries (
  id uuid primary key default gen_random_uuid(),
  kpi_id uuid not null references public.scorecard_kpis(id) on delete cascade,
  member_id uuid not null references public.team_members(id) on delete cascade,
  date date not null,
  value text check (value in ('si','no')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(kpi_id, date)
);
create index if not exists scorecard_entries_member_date_idx
  on public.scorecard_entries(member_id, date);

-- 3. scorecard_notes ----------------------------------------
create table if not exists public.scorecard_notes (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.team_members(id) on delete cascade,
  date date not null,
  note text not null default '',
  updated_at timestamptz not null default now(),
  unique(member_id, date)
);
create index if not exists scorecard_notes_member_date_idx
  on public.scorecard_notes(member_id, date);

-- 4. RLS -----------------------------------------------------
alter table public.scorecard_kpis enable row level security;
alter table public.scorecard_entries enable row level security;
alter table public.scorecard_notes enable row level security;

do $$ begin
  create policy "auth all" on public.scorecard_kpis
    for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "auth all" on public.scorecard_entries
    for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "auth all" on public.scorecard_notes
    for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

-- 5. Realtime publication -----------------------------------
do $$ begin
  alter publication supabase_realtime add table public.scorecard_kpis;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.scorecard_entries;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.scorecard_notes;
exception when duplicate_object then null; end $$;
