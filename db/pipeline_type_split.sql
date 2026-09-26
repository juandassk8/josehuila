-- =========================================================
-- Fase 2 — Split anuncios vs orgánico en Despliegue + Scripts
--
-- Cada empresa ahora puede tener DOS boards activos (uno de anuncios, uno
-- de orgánico). Los scripts también se separan por pipeline_type.
-- Conceptos y slots quedan tied via FK a board → heredan el tipo.
-- Productos siguen siendo compartidos (viven en company_voice_profile).
-- =========================================================

-- 1. despliegue_boards: columna + unique index por tipo
alter table public.despliegue_boards
  add column if not exists pipeline_type text not null default 'ads'
    check (pipeline_type in ('ads', 'organic'));

-- El unique index viejo (1 board activo por empresa) ahora permite 1 por
-- tipo (ads + organic pueden coexistir activos).
drop index if exists idx_despliegue_boards_company_active;
create unique index if not exists idx_despliegue_boards_company_type_active
  on public.despliegue_boards (company_id, pipeline_type) where active = true;

-- 2. company_scripts: columna para aislar scripts por tipo
alter table public.company_scripts
  add column if not exists pipeline_type text not null default 'ads'
    check (pipeline_type in ('ads', 'organic'));

create index if not exists company_scripts_pipeline_type_idx
  on public.company_scripts(company_id, pipeline_type);

notify pgrst, 'reload schema';
