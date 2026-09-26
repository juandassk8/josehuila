-- =========================================================
-- Permisos por rol + columna to_design + auto-tareas por stage
-- (workspace cliente)
--
-- 1. Agregar 'to_design' al CHECK constraint de status en despliegue_slots
--    (estáticos no van por scripting/to_film/to_edit, van directo a diseño).
-- 2. Agregar campos para auto-tareas en company_tasks (espejo de tasks/tasks
--    para Nat: stage_kind, slot_id, link_url, auto_generated).
--
-- Idempotente — se puede correr múltiples veces.
-- =========================================================

-- ---------- 1. CHECK constraint de status ----------

alter table public.despliegue_slots
  drop constraint if exists despliegue_slots_status_check;
alter table public.despliegue_slots
  add constraint despliegue_slots_status_check
  check (status in ('idea','scripting','to_film','to_edit','to_design','in_campaign','feedback'));

-- ---------- 2. Campos auto en company_tasks ----------

alter table public.company_tasks
  add column if not exists link_url text,
  add column if not exists slot_id uuid,
  add column if not exists stage_kind text,
  add column if not exists auto_generated boolean not null default false;

create index if not exists company_tasks_stage_kind_idx
  on public.company_tasks(stage_kind) where stage_kind is not null;
create index if not exists company_tasks_slot_idx
  on public.company_tasks(slot_id) where slot_id is not null;
create index if not exists company_tasks_auto_idx
  on public.company_tasks(auto_generated) where auto_generated = true;

-- ---------- 3. Reload del cache de PostgREST ----------

notify pgrst, 'reload schema';
