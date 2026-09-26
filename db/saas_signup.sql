-- Habilita signup self-service: cualquiera puede crear cuenta + workspace.
-- Cada nuevo usuario es owner de su propia empresa.
-- El admin global (Jose) sigue teniendo acceso total a todas (god mode).
-- Idempotente.

-- 1. Extender companies con tracking de owner + trial + KPIs iniciales.
alter table public.companies
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null,
  add column if not exists trial_started_at timestamptz default now(),
  add column if not exists trial_ends_at timestamptz,
  add column if not exists created_via text default 'admin' check (created_via in ('admin','self_signup')),
  add column if not exists kpi_targets jsonb;

create index if not exists companies_owner_user_idx
  on public.companies(owner_user_id)
  where owner_user_id is not null;

-- 2. Extender company_team_members para linkear con auth.users (email+password).
-- Algunos campos pueden ya existir de migraciones previas (email, pin, etc.).
alter table public.company_team_members
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

create index if not exists company_team_members_auth_user_idx
  on public.company_team_members(auth_user_id)
  where auth_user_id is not null;

-- 3. Trial config defaults: 14 días desde creación si trial_ends_at es null.
update public.companies
   set trial_ends_at = coalesce(trial_started_at, created_at, now()) + interval '14 days'
 where trial_ends_at is null;

notify pgrst, 'reload schema';
