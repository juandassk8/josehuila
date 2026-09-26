-- =========================================================
-- INFORCE CENTRAL — Master Tracking schema v1
-- Run this in Supabase SQL editor (Dashboard → SQL)
-- SAFE: only creates NEW tables. Does not touch companies/reports/team_schema.
-- =========================================================

-- companies.id es text/timestamp legacy en el portal viejo — FK débil via company_id text.

-- 1. content_milestones -------------------------------------
-- Un hito = una celda del grid Contenido (categoría × día).
-- Se permiten múltiples hitos por (company, week_start, day_of_week, category)
-- porque una empresa puede sacar la misma categoría varias veces en la semana.
do $$ begin
  create type mt_content_status as enum (
    'no_ejecutado',
    'en_progreso',
    'riesgo',
    'enviado',
    'aprobado',
    'bloqueo'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type mt_content_category as enum (
    'ideas',
    'guiones',
    'grabacion',
    'edicion',
    'entrega'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.content_milestones (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  week_start date not null,
  day_of_week smallint not null check (day_of_week between 1 and 6), -- 1=Lun, 6=Sáb
  category mt_content_category not null,
  status mt_content_status not null default 'no_ejecutado',
  owner_id uuid references public.team_members(id) on delete set null,
  completed_at timestamptz,
  link_url text,
  note text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists content_milestones_company_week_idx
  on public.content_milestones(company_id, week_start);
create index if not exists content_milestones_day_cat_idx
  on public.content_milestones(week_start, day_of_week, category);

-- 2. performance_reports ------------------------------------
-- Un reporte = una celda de reporte 10am o 3pm para un día de un cliente.
do $$ begin
  create type mt_report_type as enum ('am_10', 'pm_3');
exception when duplicate_object then null; end $$;

create table if not exists public.performance_reports (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  report_date date not null,   -- día del grid (no el día de los datos)
  report_type mt_report_type not null,
  sent_at timestamptz,          -- cuando se marca como enviado
  -- Datos (10am = ayer, 3pm = hoy-hasta-3pm)
  data_date date,               -- fecha a la que corresponden los datos
  conversion_value numeric,
  conversion_value_target numeric,
  spend numeric,
  spend_target numeric,
  roas numeric,
  roas_target numeric,
  analysis text,
  recommendations text,
  -- Checklist de envíos
  pdf_sent boolean not null default false,
  whatsapp_sent boolean not null default false,
  owner_id uuid references public.team_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, report_date, report_type)
);
create index if not exists performance_reports_company_date_idx
  on public.performance_reports(company_id, report_date);

-- 3. sla_support ---------------------------------------------
-- Una duda resuelta. Se agrupa por día y empresa para mostrar en la celda SLA.
create table if not exists public.sla_support (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  day_date date not null,
  question text not null,
  resolved_at timestamptz,
  response_time_minutes int,
  owner_id uuid references public.team_members(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists sla_support_company_day_idx
  on public.sla_support(company_id, day_date);

-- 4. updated_at triggers -------------------------------------
drop trigger if exists content_milestones_updated_at on public.content_milestones;
create trigger content_milestones_updated_at before update on public.content_milestones
  for each row execute function public.set_updated_at();

drop trigger if exists performance_reports_updated_at on public.performance_reports;
create trigger performance_reports_updated_at before update on public.performance_reports
  for each row execute function public.set_updated_at();

-- 5. RLS — permissive for MVP, frontend enforces role gating
alter table public.content_milestones enable row level security;
alter table public.performance_reports enable row level security;
alter table public.sla_support enable row level security;

drop policy if exists "authenticated all" on public.content_milestones;
drop policy if exists "authenticated all" on public.performance_reports;
drop policy if exists "authenticated all" on public.sla_support;

create policy "authenticated all" on public.content_milestones
  for all to authenticated using (true) with check (true);
create policy "authenticated all" on public.performance_reports
  for all to authenticated using (true) with check (true);
create policy "authenticated all" on public.sla_support
  for all to authenticated using (true) with check (true);

-- 6. Realtime publication ------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.content_milestones;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.performance_reports;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.sla_support;
exception when duplicate_object then null; end $$;
