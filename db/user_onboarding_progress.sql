-- =========================================================
-- Onboarding progress por usuario.
-- Trackea Welcome Modal + Spotlight Tours por sección.
--
-- identity_key es polimórfico para cubrir los 4 modos de auth del portal:
--   - "admin"               (Jose con PIN admin global — sin onboarding)
--   - "team:<uuid>"         (team Inforce — supabase auth, team_members.id)
--   - "member:<uuid>"       (workspace cliente colaborador — company_team_members.id)
--   - "owner:<companyslug>" (workspace cliente owner sin member record — PIN client)
--
-- Idempotente.
-- =========================================================

create table if not exists public.user_onboarding_progress (
  identity_key text primary key,
  -- Welcome modal (5 slides, primer login)
  welcome_modal_completed boolean not null default false,
  welcome_modal_completed_at timestamptz,
  -- Spotlight tours por sección. Array de strings: ["warroom","equipo",...]
  tours_completed jsonb not null default '[]',
  last_tour_shown text,
  last_tour_shown_at timestamptz,
  -- Snapshot del usuario al completar (debug + analytics)
  display_name text,
  display_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists user_onboarding_progress_updated_at on public.user_onboarding_progress;
create trigger user_onboarding_progress_updated_at
  before update on public.user_onboarding_progress
  for each row execute function public.set_updated_at();

alter table public.user_onboarding_progress enable row level security;

drop policy if exists "read user_onboarding_progress" on public.user_onboarding_progress;
create policy "read user_onboarding_progress" on public.user_onboarding_progress
  for select using (true);
drop policy if exists "write user_onboarding_progress" on public.user_onboarding_progress;
create policy "write user_onboarding_progress" on public.user_onboarding_progress
  for all using (true) with check (true);

notify pgrst, 'reload schema';
