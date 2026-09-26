-- Las tareas de cada empresa, para su empresa.
--
-- `db/company_tasks.sql` dejó las cuatro tablas del tablero con `using (true)`:
-- cualquiera con una sesión puede leer y ESCRIBIR las tareas de todas las
-- empresas llamando la API directo.
--
-- ── Por qué esta es la segunda versión ──────────────────────────────────
--
-- La primera falló al pegarla: el editor SQL de Supabase autocompleta mientras
-- uno escribe y se come texto en las líneas largas. Quedó
-- `accessible_company_idsdmin()`, `on compaticated`, `with cmpresa(task_id)`.
-- La del equipo, con líneas más cortas, pasó sin problema.
--
-- Así que acá la condición se guarda en una función y cada política queda en la
-- mitad de largo. No es cosmético: es lo que hace que el SQL se pueda pegar.
--
-- Y es idempotente de verdad —borra también los nombres nuevos— porque no
-- sabemos si el intento fallido dejó algo a medias. Corre igual esté como esté.

-- La condición, una sola vez.
create or replace function public.de_mi_empresa(cid text)
returns boolean language sql stable as $$
  select public.is_team_admin()
      or cid in (select public.accessible_company_ids())
$$;

-- `company_task_assignees` no tiene `company_id` —cuelga de la tarea—, así que
-- pregunta por la suya. `security definer` para no mirar `company_tasks` con su
-- propia RLS puesta: mismo motivo que `es_mi_tarea()` en `roles_reales.sql`.
create or replace function public.de_mi_tarea(tid uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.company_tasks t
    where t.id = tid and public.de_mi_empresa(t.company_id)
  )
$$;

grant execute on function public.de_mi_empresa(text) to authenticated;
grant execute on function public.de_mi_tarea(uuid) to authenticated;

-- Sin prefijos `public.` y en líneas cortas, por lo de arriba.
do $do$
begin
  execute 'drop policy if exists "read company_task_spaces" on company_task_spaces';
  execute 'drop policy if exists "write company_task_spaces" on company_task_spaces';
  execute 'drop policy if exists cts_empresa on company_task_spaces';
  execute 'create policy cts_empresa on company_task_spaces for all to authenticated using (de_mi_empresa(company_id)) with check (de_mi_empresa(company_id))';

  execute 'drop policy if exists "read company_tasks" on company_tasks';
  execute 'drop policy if exists "write company_tasks" on company_tasks';
  execute 'drop policy if exists ct_empresa on company_tasks';
  execute 'create policy ct_empresa on company_tasks for all to authenticated using (de_mi_empresa(company_id)) with check (de_mi_empresa(company_id))';

  execute 'drop policy if exists "read company_task_assignees" on company_task_assignees';
  execute 'drop policy if exists "write company_task_assignees" on company_task_assignees';
  execute 'drop policy if exists cta_empresa on company_task_assignees';
  execute 'create policy cta_empresa on company_task_assignees for all to authenticated using (de_mi_tarea(task_id)) with check (de_mi_tarea(task_id))';

  execute 'drop policy if exists "read company_task_activity" on company_task_activity';
  execute 'drop policy if exists "write company_task_activity" on company_task_activity';
  execute 'drop policy if exists ctac_empresa on company_task_activity';
  execute 'create policy ctac_empresa on company_task_activity for all to authenticated using (de_mi_empresa(company_id)) with check (de_mi_empresa(company_id))';
end
$do$;

notify pgrst, 'reload schema';
