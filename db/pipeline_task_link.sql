-- Conecta el Content Pipeline con el Centro de Tareas.
--
-- Las auto-tareas ya existían agrupadas por (empresa, etapa) — ver
-- `src/workspace/data/stageTasks.js` y `workspace_roles_pipeline.sql`, que ya
-- agregó `stage_kind`, `slot_id`, `link_url` y `auto_generated`. Faltan tres
-- cosas para que la tarea sirva de verdad:
--
--   · `brief_id` — el grupo ahora es (BRIEF, etapa), no (empresa, etapa). Cada
--     tanda de contenidos tiene su propia tarea, con principio y fin. Con una
--     sola tarea por empresa la barra nunca llegaba a 100%.
--   · `auto_done` / `auto_total` — el avance. Sin columnas propias habría que
--     parsear la descripción para pintar la barra, y la descripción la puede
--     editar cualquiera.
--
-- Se guardan como números y no como texto porque la tarjeta pinta una barra:
-- 9 de 21 es un dato, no una frase.
--
-- Idempotente.

alter table public.company_tasks
  add column if not exists brief_id   uuid references public.pipeline_briefs(id) on delete cascade,
  add column if not exists auto_done  int,
  add column if not exists auto_total int;

-- El sync busca por (brief_id, stage_kind) en cada pasada.
create index if not exists company_tasks_brief_stage_idx
  on public.company_tasks(brief_id, stage_kind) where brief_id is not null;

-- PostgREST cachea el esquema: sin esto no ve las columnas nuevas.
notify pgrst, 'reload schema';
