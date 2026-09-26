-- Time Tracker — linkear sesiones a tareas asignadas.
--
-- Cada sesion del "Mi tiempo" ahora puede apuntar a una tarea especifica
-- (de tasks o de company_tasks). El task_label es un snapshot del titulo
-- para sobrevivir renames/deletes de la tarea original.
--
-- task_kind text plano (no enum) para que futuros tipos de tarea no
-- requieran migracion. Frontend setea 'personal' | 'company' | null.

alter table public.time_tracker_sessions
  add column if not exists task_id uuid,
  add column if not exists task_kind text,
  add column if not exists task_label text;

create index if not exists time_tracker_sessions_task_idx
  on public.time_tracker_sessions(task_id) where task_id is not null;

-- Extender RPC switch_time_session para aceptar task params.
-- Drop primero porque cambia la firma.
drop function if exists public.switch_time_session(uuid, uuid);

create or replace function public.switch_time_session(
  p_owner uuid,
  p_category uuid,
  p_task_id uuid default null,
  p_task_kind text default null,
  p_task_label text default null
) returns public.time_tracker_sessions
language plpgsql
as $$
declare
  v_new public.time_tracker_sessions;
begin
  update public.time_tracker_sessions
     set ended_at = now()
   where owner_id = p_owner and ended_at is null;

  insert into public.time_tracker_sessions (
    owner_id, category_id, task_id, task_kind, task_label
  ) values (
    p_owner, p_category, p_task_id, p_task_kind, p_task_label
  ) returning * into v_new;

  return v_new;
end;
$$;

grant execute on function public.switch_time_session(uuid, uuid, uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
