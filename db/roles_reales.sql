-- Que el rol del equipo signifique algo.
--
-- Hasta hoy `is_team_admin()` decía "existe una fila en team_members" — sin mirar
-- el rol. El nombre engaña: no responde "¿es admin?", responde "¿es del equipo?".
-- Y de esa función cuelgan 28 políticas sobre datos de CLIENTES.
--
-- Consecuencia real: Johan figura como `editor` del equipo, así que la base lo
-- autoriza hoy a leer y escribir los datos de todas las empresas. Antes no se
-- notaba porque nadie del equipo tenía su contraseña; en el momento en que se
-- reparten credenciales, deja de ser teórico.
--
-- Y las tablas del equipo (`tasks`, `spaces`, `team_members`) quedaron con
-- `using (true)` desde el MVP, con el comentario "frontend enforces role gating".
-- Eso alcanza mientras el frontend sea el único camino; con gente entrando de
-- verdad, cualquiera puede leer las tareas de otro llamando la API directo. Por
-- eso "que no vean mis tareas" no se podía cumplir escondiéndolo de la pantalla.
--
-- Pertenecer al equipo y poder tocar los datos de todos los clientes pasan a ser
-- dos cosas distintas.
--
-- Idempotente. No reescribe las 28 políticas: las dos funciones se redefinen y
-- todas las heredan.

-- ── Quién es quién ───────────────────────────────────────────────────

-- Del equipo interno: existe y está activo. Sin mirar el rol.
-- Es lo que habilita las tablas de Inforce Central.
create or replace function public.is_team_member()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.team_members t
    where t.id = auth.uid() and coalesce(t.active, true)
  )
$$;

-- Quién OPERA las cuentas: admin y member. De acá cuelgan las 28 políticas sobre
-- datos de clientes, así que mantiene el nombre aunque diga más de lo que parece.
--
-- El primer intento pidió `role = 'admin'` y estuvo mal: trabajar sobre los
-- clientes lo hace todo el equipo operativo —Deison entra a todas las empresas,
-- al banco y a la bandeja, que es su trabajo—. Lo que no comparte es la agenda
-- personal de otro, y eso se resuelve abajo, en `tasks`.
--
-- El `editor` queda afuera: edita videos de una cuenta puntual, no opera la
-- cartera. Y el `active` importa: desactivar a alguien tiene que quitarle el
-- acceso de una, no solo esconderle la pantalla de login.
create or replace function public.is_team_admin()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.team_members t
    where t.id = auth.uid() and t.role in ('admin', 'member') and coalesce(t.active, true)
  )
$$;

-- Admin de verdad. Solo para lo que no se comparte ni dentro del equipo: la
-- agenda de cada uno y la ficha de los demás.
create or replace function public.es_admin_real()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.team_members t
    where t.id = auth.uid() and t.role = 'admin' and coalesce(t.active, true)
  )
$$;

-- ¿Esta tarea es mía? Asignada o creada por mí.
--
-- Va en una función `security definer` para romper la recursión — la política de
-- `tasks` necesita mirar `task_assignees` y la de `task_assignees` necesita mirar
-- `tasks`.
--
-- Devuelve boolean y no un conjunto de ids: un `setof` obliga a meterlo en un
-- `in (select ...)` dentro de la política, que además de ser más frágil de
-- escribir obliga a materializar todas mis tareas para responder por una sola.
create or replace function public.es_mi_tarea(p_task_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.task_assignees ta
    where ta.task_id = p_task_id and ta.member_id = auth.uid()
  ) or exists (
    select 1 from public.tasks t
    where t.id = p_task_id and t.created_by = auth.uid()
  )
$$;

grant execute on function public.is_team_member() to authenticated;
grant execute on function public.is_team_admin() to authenticated;
grant execute on function public.es_admin_real() to authenticated;
grant execute on function public.es_mi_tarea(uuid) to authenticated;

-- ── Las tablas del equipo interno ────────────────────────────────────
--
-- Escrito corto y SIN calificar `public.` a propósito. El editor SQL de Supabase
-- autocompleta al tipear un punto y se come texto del medio: llegó a convertir
-- "on public.spaces for insert to authenticated" en "on publthenticated". El
-- search_path ya incluye `public`, así que no hace falta nombrarlo.
--
-- Todo dentro de un `do $do$`: un solo statement no se puede partir mal.
--
-- Se apoya en que las políticas permisivas se combinan con OR. Por eso alcanza
-- con una regla amplia por tabla más, donde hace falta, una segunda que abra el
-- alta: al insertar una tarea todavía no hay asignados, así que exigir que sea
-- "mía" haría imposible crearla.

do $do$
begin
  execute 'drop policy if exists "authenticated all" on team_members';
  execute 'drop policy if exists "authenticated all" on tasks';
  execute 'drop policy if exists "authenticated all" on task_assignees';
  execute 'drop policy if exists "authenticated all" on spaces';

  -- El equipo se ve entre sí; escribir la ficha de otro es solo del admin.
  execute 'create policy tm_ver on team_members for select to authenticated using (is_team_member())';
  execute 'create policy tm_editar on team_members for all to authenticated using (es_admin_real() or id = auth.uid())';

  -- El admin ve todas las tareas; los demás, las suyas.
  execute 'create policy t_propias on tasks for all to authenticated using (es_admin_real() or es_mi_tarea(id))';
  execute 'create policy t_crear on tasks for insert to authenticated with check (is_team_member())';

  execute 'create policy ta_propias on task_assignees for all to authenticated using (es_admin_real() or member_id = auth.uid() or es_mi_tarea(task_id))';
  execute 'create policy ta_crear on task_assignees for insert to authenticated with check (is_team_member())';

  -- Las carpetas del equipo dejan de estar abiertas a cualquier logueado,
  -- incluidos los clientes.
  execute 'create policy sp_equipo on spaces for all to authenticated using (is_team_member())';
end
$do$;

notify pgrst, 'reload schema';
