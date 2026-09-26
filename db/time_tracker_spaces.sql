-- Time Tracker — refactor: sesiones apuntan a un space en vez de category.
-- Las categorias custom (Marca personal, Otros, etc) quedan archivadas; las
-- cards de Mi tiempo ahora vienen de los spaces del sidebar.
--
-- SAFE: idempotente. Se puede correr varias veces sin problema.

-- 1) Sessions ahora pueden apuntar a un space (nullable).
alter table public.time_tracker_sessions
  add column if not exists space_id uuid references public.spaces(id) on delete set null;

create index if not exists time_tracker_sessions_space_idx
  on public.time_tracker_sessions(space_id) where space_id is not null;

-- 2) category_id pasa a nullable (sesiones nuevas usan space_id; las viejas
--    siguen apuntando a la category legacy).
alter table public.time_tracker_sessions
  alter column category_id drop not null;

-- 3) RPC switch_time_session: recibe space en lugar de category.
--    Drop la firma vieja y la recreamos.
drop function if exists public.switch_time_session(uuid, uuid);
drop function if exists public.switch_time_session(uuid, uuid, uuid, text, text);

create or replace function public.switch_time_session(
  p_owner uuid,
  p_space uuid default null,
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
    owner_id, category_id, space_id, task_id, task_kind, task_label
  ) values (
    p_owner, null, p_space, p_task_id, p_task_kind, p_task_label
  ) returning * into v_new;

  return v_new;
end;
$$;

grant execute on function public.switch_time_session(uuid, uuid, uuid, text, text) to authenticated;

-- 4) Archivar todas las categorias custom del time tracker. El user decidio
--    descontinuarlas a favor de los spaces del sidebar.
update public.time_tracker_categories set archived = true where archived = false;

notify pgrst, 'reload schema';
