-- El equipo de cada empresa, para su empresa.
--
-- `db/team_members_schema.sql` dejó la tabla con `USING (true)` en SELECT y en
-- ALL. Con eso, cualquiera con una sesión puede leer, insertar, editar y
-- **borrar** el equipo de cualquier empresa llamando la API directo. Incluye
-- borrar la ficha del dueño de otra cuenta, o ponerse a sí mismo como
-- `is_owner` de una empresa ajena.
--
-- Hasta ahora era teórico porque del lado del cliente nadie tenía razón para
-- tocar esa tabla. Deja de serlo justo ahora, que le estamos dando la pantalla
-- para administrar su propia gente.
--
-- Mismo patrón que `pipeline_slots` (`db/content_pipeline.sql`):
--
--     is_team_admin() or company_id in (select accessible_company_ids())
--
-- `accessible_company_ids()` es `security definer`, así que resuelve mirando
-- esta misma tabla sin morderse la cola con la política. Y matchea por
-- `auth_user_id` O por el correo del JWT, que es como entra alguien la primera
-- vez —antes de que exista el vínculo—: sin esa segunda vía, el primer login de
-- un colaborador nuevo no encontraría su propia ficha.
--
-- Idempotente.

-- Escrito corto y SIN calificar `public.`: el editor SQL de Supabase
-- autocompleta al tipear un punto y se come texto del medio. El search_path ya
-- incluye `public`. Todo en un `do $do$`: un solo statement no se parte mal.
do $do$
begin
  execute 'drop policy if exists "read company_team_members" on company_team_members';
  execute 'drop policy if exists "write company_team_members" on company_team_members';

  execute 'create policy ctm_empresa on company_team_members for all to authenticated using (is_team_admin() or company_id in (select accessible_company_ids())) with check (is_team_admin() or company_id in (select accessible_company_ids()))';
end
$do$;

notify pgrst, 'reload schema';
