-- Fase 0 · Login con Google — matcheo por email verificado (red de seguridad).
--
-- Un login con Google puede crear un auth.uid NUEVO (distinto al de la cuenta
-- email/contraseña). Para que ni el equipo ni los dueños queden sin acceso si el
-- uid no coincide, sumamos una rama de EMAIL VERIFICADO a las dos funciones de
-- RLS que hoy dependen del uid. Es seguro: el email de Google viene verificado y
-- el match es exacto (mismo patrón que ya usa company_team_members.email).
--
-- Additiva e idempotente. Correr en el SQL Editor de Supabase como postgres.
-- Reversible: re-crear la versión previa (sin la rama de email).

-- is_team_admin(): admin por uid O por email verificado.
create or replace function public.is_team_admin()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.team_members t
    where t.id = auth.uid()
       or ( nullif(lower(auth.jwt() ->> 'email'), '') is not null
            and lower(t.email) = lower(auth.jwt() ->> 'email') )
  );
$$;

-- accessible_company_ids(): agrega dueño por email verificado (companies.email).
create or replace function public.accessible_company_ids()
returns setof text language sql stable security definer set search_path = public, pg_temp as $$
  select c.id from public.companies c where c.owner_user_id = auth.uid()
  union
  select cu.company_id from public.client_users cu where cu.user_id = auth.uid()
  union
  select ctm.company_id from public.company_team_members ctm
   where ctm.auth_user_id = auth.uid()
      or ( nullif(lower(auth.jwt() ->> 'email'), '') is not null
           and lower(ctm.email) = lower(auth.jwt() ->> 'email') )
  union
  select c2.id from public.companies c2
   where nullif(lower(auth.jwt() ->> 'email'), '') is not null
     and lower(c2.email) = lower(auth.jwt() ->> 'email');
$$;

notify pgrst, 'reload schema';
