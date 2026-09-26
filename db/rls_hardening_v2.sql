-- =====================================================================
-- db/rls_hardening_v2.sql — cierra el hueco RLS de las tablas company_*
--
-- HALLAZGO: varias tablas por-empresa quedaron con `for all using(true)` (rol
-- public → incluye ANON). Es decir, cualquiera con la anon key podía leer/escribir
-- los productos, guiones, expertise y consumo de CUALQUIER empresa. rls_hardening_v1
-- NO las cubrió. Acá las tenant-scopeamos con el MISMO patrón ya probado (despliegue):
--   team = god-mode (is_team_admin) · cada empresa solo la suya (company_id) · anon = fuera.
--
-- Todas tienen company_id (verificado). Idempotente. Correr como `postgres`
-- (dueño con BYPASSRLS) en el SQL Editor de Supabase.
--
-- DESPUÉS DE CORRER, PROBAR (deben seguir funcionando logueado):
--   * Guionista → Info del producto (leer/guardar productos).
--   * Content Pipeline → Configurar (productos/estrategia).
--   * Generar un guion (company_scripts) y ver el consumo (company_token_usage).
--   * Un cliente entrando a SU empresa ve/edita lo suyo; NO puede ver otra empresa.
-- Si algo se bloquea, es que ese usuario no está bien vinculado a la empresa
-- (owner_user_id / client_users / company_team_members) — mismo patrón que despliegue.
-- =====================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'company_voice_profile',
    'company_scripts',
    'company_script_formats',
    'company_expertise_base',
    'company_expertise_documents',
    'company_ugcs',
    'company_token_usage'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
    -- Quitar las políticas viejas abiertas (nombres usados en las migraciones).
    execute format('drop policy if exists %I on public.%I;', 'read '||t, t);
    execute format('drop policy if exists %I on public.%I;', 'write '||t, t);
    execute format('drop policy if exists %I on public.%I;', t||' tenant', t);
    -- Política tenant (misma forma que rls_hardening_v1).
    execute format($f$
      create policy %I on public.%I for all to authenticated
        using ( public.is_team_admin() or company_id in (select public.accessible_company_ids()) )
        with check ( public.is_team_admin() or company_id in (select public.accessible_company_ids()) );
    $f$, t||' tenant', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
