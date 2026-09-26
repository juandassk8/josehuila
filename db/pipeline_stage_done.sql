-- El avance de las tareas del pipeline sale de un check, no de una corazonada.
--
-- La primera versión contaba como "listo" el slot que tuviera llena la carpeta
-- del creativo. Pero esa carpeta se llena por adelantado, cuando se prepara la
-- tanda, así que la tarea decía "20 de 37 listos" sin que se hubiera editado un
-- solo video. Una señal que se llena por otra razón no sirve para medir trabajo.
--
--   · `stage_done` — lo marca quien hace el trabajo, desde su propia tarea. Se
--     resetea al mover el slot de etapa: un video terminado de editar no está
--     terminado de publicar.
--   · `auto_key` — `brief|etapa|fecha`, con índice ÚNICO. Sin esto el sync
--     buscaba la tarea solo entre las abiertas: al cerrarse una, la pasada
--     siguiente no la encontraba y creaba otra. Así aparecieron cuatro "Grabar
--     contenido · Brief 1" para el mismo brief.
--
-- Idempotente.

alter table public.pipeline_slots
  add column if not exists stage_done boolean not null default false;

alter table public.company_tasks
  add column if not exists auto_key text;

-- Único de verdad: dos tareas automáticas no pueden describir el mismo trabajo.
--
-- SIN `where auto_key is not null` aunque parezca que sobra índice: PostgREST
-- no puede hacer upsert contra un índice PARCIAL (Postgres pide repetir el
-- predicado en el ON CONFLICT y el cliente no tiene cómo expresarlo), y devuelve
-- 42P10. Igual no hace falta: en Postgres dos NULL no colisionan entre sí, así
-- que las tareas manuales conviven sin problema.
drop index if exists public.company_tasks_auto_key_uidx;
create unique index if not exists company_tasks_auto_key_uidx
  on public.company_tasks(auto_key);

-- PostgREST cachea el esquema: sin esto no ve las columnas nuevas.
notify pgrst, 'reload schema';
