-- =====================================================================
-- db/content_pipeline.sql — Content Pipeline (briefs + slots) POR EMPRESA
--
-- Modelo nuevo del módulo Content Pipeline: cada empresa tiene BRIEFS (tandas)
-- que agrupan SLOTS (contenidos video/estático) que avanzan por etapas
-- idea → scripting → film → edit → campaign → feedback.
--
-- RLS multi-tenant reusando los helpers de rls_hardening_v1.sql:
--   team (is_team_admin) = god-mode; cada empresa solo la suya (por company_id).
-- Correr en el SQL Editor de Supabase como postgres. Idempotente.
-- =====================================================================

-- ── Briefs ───────────────────────────────────────────────────────────
create table if not exists public.pipeline_briefs (
  id            uuid primary key default gen_random_uuid(),
  company_id    text not null,
  name          text not null,
  owner         text,
  created_label text,                       -- "27 jul" (display)
  archived      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists pipeline_briefs_company_idx on public.pipeline_briefs(company_id);

-- ── Slots (contenidos) ───────────────────────────────────────────────
create table if not exists public.pipeline_slots (
  id           uuid primary key default gen_random_uuid(),
  brief_id     uuid references public.pipeline_briefs(id) on delete cascade,
  company_id   text not null,
  concept_id   uuid,                              -- vínculo al concepto del despliegue (opcional)
  num          int not null default 1,
  tipo         text not null default 'video',     -- 'video' | 'estatico'
  producto     text, formato text, angulo text, concepto text, creador text,
  descripcion  text,
  ref          text, loom text,
  stage        text not null default 'idea',      -- idea|scripting|film|edit|campaign|feedback
  script       text,                              -- HTML del guion
  refs         jsonb not null default '[]'::jsonb, -- ids de referencias del banco
  notas        text,
  editor       text,
  due          date,
  drive        text,
  publicado    boolean not null default false,
  feedback     text,
  metrics      jsonb not null default '{}'::jsonb, -- {gasto,resultados,cpa,roas}
  sort_order   double precision not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
-- Para tablas ya creadas (idempotente): agrega concept_id / product_id si faltan.
alter table public.pipeline_slots add column if not exists concept_id uuid;
alter table public.pipeline_slots add column if not exists product_id text;

-- Loop de resultados: los creativos producidos del despliegue guardan las métricas
-- (rellenadas desde la etapa Feedback del pipeline) + el link al slot de origen.
alter table public.despliegue_variations add column if not exists metrics jsonb not null default '{}'::jsonb;
alter table public.despliegue_variations add column if not exists pipeline_slot_id text;
-- Dimensiones denormalizadas del creativo producido (formato/angulo/creador/producto)
-- → el scorecard de Ganadores rankea por ellas sin joins al pipeline.
alter table public.despliegue_variations add column if not exists dims jsonb not null default '{}'::jsonb;
-- Índice ÚNICO (los NULL son distintos en Postgres → no afecta a las referencias):
-- garantiza 1 sola variación producida por slot y habilita el upsert onConflict.
drop index if exists public.despliegue_variations_pipeline_slot_idx;
create unique index if not exists despliegue_variations_pipeline_slot_uniq
  on public.despliegue_variations(pipeline_slot_id);
create index if not exists pipeline_slots_brief_idx   on public.pipeline_slots(brief_id);
create index if not exists pipeline_slots_company_idx on public.pipeline_slots(company_id);
create index if not exists pipeline_slots_stage_idx   on public.pipeline_slots(stage);

-- ── updated_at automático ────────────────────────────────────────────
create or replace function public.pipeline_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists pipeline_briefs_touch on public.pipeline_briefs;
create trigger pipeline_briefs_touch before update on public.pipeline_briefs
  for each row execute function public.pipeline_touch_updated_at();
drop trigger if exists pipeline_slots_touch on public.pipeline_slots;
create trigger pipeline_slots_touch before update on public.pipeline_slots
  for each row execute function public.pipeline_touch_updated_at();

-- ── RLS: team god-mode + cada empresa la suya (patrón despliegue) ─────
alter table public.pipeline_briefs enable row level security;
drop policy if exists "pipeline_briefs tenant" on public.pipeline_briefs;
create policy "pipeline_briefs tenant" on public.pipeline_briefs for all to authenticated
  using ( public.is_team_admin() or company_id in (select public.accessible_company_ids()) )
  with check ( public.is_team_admin() or company_id in (select public.accessible_company_ids()) );

alter table public.pipeline_slots enable row level security;
drop policy if exists "pipeline_slots tenant" on public.pipeline_slots;
create policy "pipeline_slots tenant" on public.pipeline_slots for all to authenticated
  using ( public.is_team_admin() or company_id in (select public.accessible_company_ids()) )
  with check ( public.is_team_admin() or company_id in (select public.accessible_company_ids()) );

-- ── Catálogo por empresa (productos / ángulos / creadores) para los selects ──
create table if not exists public.pipeline_catalog (
  id          uuid primary key default gen_random_uuid(),
  company_id  text not null,
  kind        text not null,        -- 'producto' | 'angulo' | 'creador'
  value       text not null,
  info        text,                 -- info extra (producto)
  created_at  timestamptz not null default now()
);
create index if not exists pipeline_catalog_company_idx on public.pipeline_catalog(company_id);

alter table public.pipeline_catalog enable row level security;
drop policy if exists "pipeline_catalog tenant" on public.pipeline_catalog;
create policy "pipeline_catalog tenant" on public.pipeline_catalog for all to authenticated
  using ( public.is_team_admin() or company_id in (select public.accessible_company_ids()) )
  with check ( public.is_team_admin() or company_id in (select public.accessible_company_ids()) );
