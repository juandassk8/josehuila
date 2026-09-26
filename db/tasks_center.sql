-- Centro de Tareas: lo que le falta a `company_tasks` para el tablero nuevo.
--
-- Tres cosas, ninguna destructiva:
--
--   1. `bloqueado` como estado. Hoy una tarea trabada no se puede marcar: queda
--      en "en curso" y nadie sabe que está esperando algo. Es la cuarta columna
--      del tablero y lo que enciende el badge rojo en la vista por persona.
--   2. `rol` — qué función del equipo hace la tarea (copywriter, editor…). Es
--      distinto de quién la hace: el rol pinta la tarea y sobrevive a que la
--      persona cambie. Las claves son las de `src/workspace/team_roles.js`.
--   3. `tipo` — 'ritmo' (recurrente, sale del calendario de roles cada semana)
--      o 'puntual' (one-off). Lo que ya existía se marca como puntual.
--
-- Nada de esto rompe la vista vieja: son columnas nuevas y un valor más en un
-- enum. Idempotente.

-- ── 1. Estado bloqueado ──────────────────────────────────────────────
-- ADD VALUE IF NOT EXISTS es idempotente desde PG 9.6.
alter type company_task_status add value if not exists 'bloqueado';

-- ── 2 y 3. Rol y tipo ────────────────────────────────────────────────
alter table public.company_tasks
  add column if not exists rol  text,
  add column if not exists tipo text not null default 'puntual';

-- El CHECK va en un DO porque `add constraint if not exists` no existe.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'company_tasks_tipo_check'
  ) then
    alter table public.company_tasks
      add constraint company_tasks_tipo_check check (tipo in ('ritmo', 'puntual'));
  end if;
end $$;

-- Se filtra por persona y por día todo el tiempo; sin esto son seq scans.
create index if not exists company_tasks_company_due_idx
  on public.company_tasks(company_id, due_date);

-- PostgREST cachea el esquema: sin esto no ve las columnas nuevas.
notify pgrst, 'reload schema';
