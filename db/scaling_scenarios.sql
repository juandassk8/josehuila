-- Escenarios del Simulador de Escala (Despliegue Creativo). Cada row es un
-- snapshot inmutable de inputs (estado del cliente + estrategia) + el cache
-- del output, para que aunque la config del board cambie después, el escenario
-- siga reflejando lo modelado.
--
-- Idempotente. RLS permisiva (mismo patrón que despliegue_* y company_*).

create table if not exists public.scaling_scenarios (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  board_id uuid references public.despliegue_boards(id) on delete set null,

  name text not null,
  description text,
  is_archived boolean not null default false,

  -- Snapshot del estado del cliente al momento de guardar
  current_budget_weekly numeric not null,
  target_budget_weekly numeric not null,
  cpa numeric not null,
  ticket_aov numeric not null,

  -- Estrategia
  tests_per_week integer not null,
  test_budget_multiplier numeric not null,
  win_rate numeric not null,
  capacity_per_winner numeric not null,
  max_growth_rate numeric not null,

  -- Inputs del planificador inverso (si vino de ahí)
  planner_target_monthly_revenue numeric,
  planner_target_weeks integer,

  -- Cache del output (preview en la lista sin recalcular)
  cached_weeks_to_target integer,
  cached_monthly_lift numeric,
  cached_total_investment numeric,
  cached_final_roas numeric,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scaling_scenarios_company_idx
  on public.scaling_scenarios(company_id);
create index if not exists scaling_scenarios_board_idx
  on public.scaling_scenarios(board_id);

alter table public.scaling_scenarios enable row level security;

drop policy if exists "read scaling_scenarios" on public.scaling_scenarios;
create policy "read scaling_scenarios" on public.scaling_scenarios for select using (true);

drop policy if exists "write scaling_scenarios" on public.scaling_scenarios;
create policy "write scaling_scenarios" on public.scaling_scenarios for all using (true) with check (true);

do $$ begin
  alter publication supabase_realtime add table public.scaling_scenarios;
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';
