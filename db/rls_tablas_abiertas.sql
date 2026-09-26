-- =====================================================================
-- db/rls_tablas_abiertas.sql — cerrar las 9 tablas que quedaron en `true`
--
-- Auditoría del 2026-08-18 sobre las 74 tablas: todas tienen RLS y NINGUNA
-- política alcanza a `anon`. Pero nueve quedaron con `using (true)` para
-- `authenticated`, y eso ya no significa "el equipo": 39 de los 54 miembros de
-- empresas cliente tienen `auth_user_id`, o sea que los clientes SON usuarios
-- autenticados. Con `for all`, cualquiera de ellos podía leer —y borrar— estas
-- tablas.
--
-- Son dos problemas distintos y por eso van con dos remedios distintos.
-- =====================================================================

-- ── 1. Tablas internas de Inforce ────────────────────────────────────
-- El Guionista interno, la base de conocimiento y la investigación. El portal
-- del cliente NUNCA las toca: usa las `company_*` (verificado en
-- workspace_guiones_db.js, que solo lee company_script_formats /
-- company_script_structures / company_voice_profile). `tag_options` y
-- `research_companies` tampoco: solo aparecen bajo src/team.
--
-- `is_team_member` y no `is_team_admin`: los editores también trabajan acá.
do $do$
declare t text;
begin
  foreach t in array array[
    'expertise_base','expertise_documents','scripts','script_formats',
    'voice_profile','research_companies','tag_options'
  ] loop
    execute format('drop policy if exists auth_all_%I on %I', t, t);
    execute format('drop policy if exists %I on %I', t || ' all for authenticated', t);
    execute format('drop policy if exists %I on %I', 'authenticated all', t);
    execute format('drop policy if exists solo_equipo on %I', t);
    execute format(
      'create policy solo_equipo on %I for all to authenticated
         using (is_team_member()) with check (is_team_member())', t);
  end loop;
end
$do$;

-- ── 2. El plan de implementación, que sí es por cliente ──────────────
-- `plan_pasos` ya estaba acotada por `cliente`; `plan_subtareas` y `plan_metas`
-- se agregaron después y se quedaron en `true`. Con eso, un cliente podía leer y
-- escribir el avance del plan de otro.
--
-- La condición es la MISMA que ya usa plan_pasos, copiada tal cual: casa el slug
-- guardado o el nombre slugificado, porque no todas las empresas tienen `slug`.
do $do$
declare t text;
begin
  foreach t in array array['plan_subtareas','plan_metas'] loop
    execute format('drop policy if exists auth_all_%I on %I', t, t);
    execute format('drop policy if exists %I_scoped on %I', t, t);
    execute format(
      'create policy %I_scoped on %I for all to authenticated
         using (is_team_admin() or exists (
           select 1 from companies c
           where c.id in (select accessible_company_ids())
             and (c.slug = %I.cliente
                  or lower(regexp_replace(c.name, ''\s+'', ''-'', ''g'')) = %I.cliente)))
         with check (is_team_admin() or exists (
           select 1 from companies c
           where c.id in (select accessible_company_ids())
             and (c.slug = %I.cliente
                  or lower(regexp_replace(c.name, ''\s+'', ''-'', ''g'')) = %I.cliente)))',
      t, t, t, t, t, t);
  end loop;
end
$do$;

-- ── 3. Las políticas duplicadas de company_tasks ─────────────────────
-- Las cuatro tablas del tablero tienen DOS políticas que dicen lo mismo: las
-- `*_empresa` de company_tasks_rls.sql y las `* tenant` de la tanda de
-- endurecimiento. Al ser permisivas se combinan con OR, así que no hay agujero
-- —pero cada consulta evalúa las dos, y el día que alguien ajuste una va a creer
-- que cerró algo que la otra sigue abriendo.
--
-- Se quedan las `* tenant`, que son las de la tanda general.
drop policy if exists ct_empresa   on company_tasks;
drop policy if exists cts_empresa  on company_task_spaces;
drop policy if exists cta_empresa  on company_task_assignees;
drop policy if exists ctac_empresa on company_task_activity;

-- ── 4. Las "team only" que quedaron cubiertas ────────────────────────
-- Sobre scripts / expertise_base / script_formats / voice_profile había además
-- una política `<tabla> team only` con `is_team_admin()`. Estaba siendo anulada
-- por la abierta —permisivas, se combinan con OR— así que nadie notó que existía.
--
-- `is_team_admin()` pide role in ('admin','member'); `is_team_member()` solo pide
-- estar activo. La segunda contiene a la primera, y encima incluye a los
-- EDITORES, que son quienes usan el Guionista interno todos los días. Dejar la
-- vieja no agregaba nada y hacía creer que el acceso era más chico de lo que era.
drop policy if exists "scripts team only"        on scripts;
drop policy if exists "expertise_base team only" on expertise_base;
drop policy if exists "script_formats team only" on script_formats;
drop policy if exists "voice_profile team only"  on voice_profile;

notify pgrst, 'reload schema';
