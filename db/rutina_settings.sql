-- Notas editables de "Mi rutina" por miembro. Tabla nueva; no toca nada existente. Idempotente.
create table if not exists public.routine_settings (
  owner_id uuid primary key references public.team_members(id) on delete cascade,
  notes jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.routine_settings enable row level security;
drop policy if exists routine_settings_own on public.routine_settings;
create policy routine_settings_own on public.routine_settings for all to authenticated
  using (owner_id = auth.uid() and public.is_team_member())
  with check (owner_id = auth.uid() and public.is_team_member());
notify pgrst, 'reload schema';
