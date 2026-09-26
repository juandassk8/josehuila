-- =========================================================
-- INFORCE CENTRAL — SOPs / Manuales (Central Command por miembro)
-- Cada SOP pertenece a un miembro (owner_id). Se agrupan por group_title.
-- Aditivo: tabla nueva, no toca existentes.
-- =========================================================

create table if not exists public.sops (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.team_members(id) on delete cascade,
  group_title text not null,
  group_subtitle text,
  group_sort int not null default 0,
  title text not null,
  focus_text text,
  loom_url text,
  doc_url text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sops_owner_idx on public.sops(owner_id);
create index if not exists sops_group_sort_idx on public.sops(owner_id, group_sort, sort_order);

-- RLS permissive (igual al resto del módulo)
alter table public.sops enable row level security;
drop policy if exists "authenticated all" on public.sops;
create policy "authenticated all" on public.sops
  for all to authenticated using (true) with check (true);

-- Realtime
do $$ begin
  alter publication supabase_realtime add table public.sops;
exception when duplicate_object then null; end $$;

-- Updated_at trigger (reutiliza set_updated_at si existe, si no lo crea)
do $$ begin
  create or replace function public.set_updated_at()
  returns trigger language plpgsql as $f$
  begin new.updated_at := now(); return new; end $f$;
exception when duplicate_function then null; end $$;

drop trigger if exists sops_updated_at on public.sops;
create trigger sops_updated_at before update on public.sops
  for each row execute function public.set_updated_at();
