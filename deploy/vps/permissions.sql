-- Última capa local: los scripts históricos no determinan el acceso por orden accidental.
create or replace function public.is_team_member() returns boolean language sql stable security definer set search_path=public,pg_temp as $$
select exists(select 1 from team_members where id=auth.uid() and coalesce(active,true)) $$;
create or replace function public.is_team_admin() returns boolean language sql stable security definer set search_path=public,pg_temp as $$
select exists(select 1 from team_members where id=auth.uid() and role in ('admin','member') and coalesce(active,true)) $$;
create or replace function public.es_admin_real() returns boolean language sql stable security definer set search_path=public,pg_temp as $$
select exists(select 1 from team_members where id=auth.uid() and role='admin' and coalesce(active,true)) $$;

-- El proceso de autenticación usa el rol `inforce`, sujeto a RLS. Esta función
-- mínima le permite comprobar una baja sin darle acceso general a las tablas.
create or replace function app_private.inactive_team_member(p_id uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.team_members where id=p_id and not coalesce(active,true))
$$;
revoke all on function app_private.inactive_team_member(uuid) from public,anon,authenticated;
grant execute on function app_private.inactive_team_member(uuid) to inforce;

create or replace function public.can_manage_company(p_id text) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select is_team_admin() or exists(select 1 from companies where id=p_id and owner_user_id=auth.uid()) or exists(
 select 1 from company_team_members where company_id=p_id and (auth_user_id=auth.uid() or lower(email)=lower(auth.jwt()->>'email')) and (is_owner or roles && array['owner','project_manager'])) $$;

-- Impide elevar privilegios editando la propia ficha por la API de datos.
create or replace function app_private.guard_member_privileges() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.role()='authenticated' and not es_admin_real() then
    if new.role is distinct from old.role or new.active is distinct from old.active
      or new.access_overrides is distinct from old.access_overrides or new.is_reviewer is distinct from old.is_reviewer
      or new.id is distinct from old.id or new.email is distinct from old.email then
      raise exception 'Solo el administrador puede cambiar el acceso' using errcode='42501';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_member_privileges on public.team_members;
create trigger guard_member_privileges before update on public.team_members for each row execute function app_private.guard_member_privileges();
drop policy if exists local_create_member on public.team_members;
create policy local_create_member on public.team_members as restrictive for insert to authenticated with check (public.es_admin_real());

create or replace function app_private.guard_company_owner() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.role()='authenticated' and not is_team_admin() and new.owner_user_id is distinct from old.owner_user_id then
  raise exception 'Solo el equipo puede transferir la propiedad' using errcode='42501';
 end if;
 return new;
end $$;
drop trigger if exists guard_company_owner on public.companies;
create trigger guard_company_owner before update on public.companies for each row execute function app_private.guard_company_owner();

-- Los dueños pueden gestionar nombres y funciones de su equipo, pero el vínculo
-- con una identidad de Auth solo lo establece el backend con service_role.
create or replace function app_private.guard_company_member_identity() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.role()='authenticated' and not es_admin_real() then
  if tg_op='INSERT' and new.auth_user_id is not null then
   raise exception 'El vínculo de acceso lo crea el servidor' using errcode='42501';
  end if;
  if tg_op='UPDATE' and (
    new.auth_user_id is distinct from old.auth_user_id
    or new.company_id is distinct from old.company_id
    or (old.auth_user_id is not null and new.email is distinct from old.email)
  ) then
   raise exception 'No se puede cambiar la identidad vinculada' using errcode='42501';
  end if;
 end if;
 return new;
end $$;
drop trigger if exists guard_company_member_identity on public.company_team_members;
create trigger guard_company_member_identity before insert or update on public.company_team_members
for each row execute function app_private.guard_company_member_identity();

-- Guardas RESTRICTIVAS: se combinan con AND con las políticas del módulo.
do $$
declare t record; predicate text; p record;
begin
 for t in select tablename from pg_tables where schemaname='public' loop
  execute format('alter table public.%I enable row level security',t.tablename);
  execute format('drop policy if exists local_scope on public.%I',t.tablename);
  predicate := 'public.is_team_member()';
  if t.tablename='team_members' then predicate := 'public.is_team_member() or id=auth.uid()';
  elsif t.tablename='companies' then predicate := 'public.is_team_admin() or owner_user_id=auth.uid() or id in (select public.accessible_company_ids())';
  elsif t.tablename='company_script_structures' then predicate := 'public.is_team_admin() or is_global or company_id in (select public.accessible_company_ids())';
  elsif t.tablename='tasks' then predicate := 'public.is_team_member() and (public.es_admin_real() or created_by=auth.uid() or public.es_mi_tarea(id))';
  elsif t.tablename='task_assignees' then predicate := 'public.is_team_member() and (public.es_admin_real() or public.es_mi_tarea(task_id))';
  elsif t.tablename='client_users' then predicate := 'public.is_team_admin() or user_id=auth.uid()';
  elsif t.tablename='company_task_assignees' then predicate := 'task_id in (select public.accessible_task_ids())';
  elsif t.tablename='despliegue_variations' then predicate := 'concept_id in (select public.accessible_concept_ids())';
  elsif t.tablename='despliegue_concepts' then predicate := 'board_id in (select public.accessible_board_ids())';
  elsif t.tablename in ('despliegue_slots','despliegue_weekly_plans') then predicate := 'board_id in (select public.accessible_board_ids())';
  elsif t.tablename='creative_items' then predicate := 'delivery_id in (select public.accessible_delivery_ids())';
  elsif t.tablename='notifications' then predicate := 'public.is_team_admin() or recipient_key in (select public.accessible_identity_keys()) or company_id in (select public.accessible_company_ids())';
  elsif t.tablename in ('user_onboarding_progress','video_tutorial_progress') then predicate := 'identity_key in (select public.accessible_identity_keys())';
  elsif t.tablename='platform_feedback' then predicate := 'public.es_admin_real() or team_member_id=auth.uid() or lower(reporter_email)=lower(auth.jwt()->>''email'')';
  elsif t.tablename like 'finance_%' then predicate := 'public.es_admin_real()';
  elsif t.tablename in ('plan_pasos','plan_subtareas','plan_metas') then predicate := 'public.is_team_admin() or cliente in (select slug from public.companies where id in (select public.accessible_company_ids()))';
  elsif exists(select 1 from information_schema.columns where table_schema='public' and table_name=t.tablename and column_name='company_id') then
    predicate := 'public.is_team_admin() or company_id in (select public.accessible_company_ids())';
  elsif exists(select 1 from information_schema.columns where table_schema='public' and table_name=t.tablename and column_name='owner_id') then
    if t.tablename='spaces' then predicate := 'public.is_team_member() and (public.es_admin_real() or owner_id=auth.uid() or visibility=''shared'')';
    else predicate := 'public.es_admin_real() or owner_id=auth.uid()'; end if;
  end if;
  execute format('create policy local_scope on public.%I as restrictive for all to authenticated using (%s) with check (%s)',t.tablename,predicate,predicate);
 end loop;
end $$;

-- Dar acceso a una empresa no implica poder administrarle sus miembros.
drop policy if exists local_manage_members on public.company_team_members;
create policy local_manage_members on public.company_team_members as restrictive for insert to authenticated with check(public.can_manage_company(company_id));
drop policy if exists local_update_members on public.company_team_members;
create policy local_update_members on public.company_team_members as restrictive for update to authenticated using(public.can_manage_company(company_id)) with check(public.can_manage_company(company_id));
drop policy if exists local_delete_members on public.company_team_members;
create policy local_delete_members on public.company_team_members as restrictive for delete to authenticated using(public.can_manage_company(company_id));

revoke all on all tables in schema public from anon;
revoke all on all tables in schema auth from anon,authenticated;
revoke all on schema app_private from public,anon,authenticated;
grant usage on schema public to anon,authenticated,service_role;
grant anon,authenticated,service_role to inforce_data;
grant select,insert,update,delete on all tables in schema public to authenticated,service_role;
grant usage,select on all sequences in schema public to authenticated,service_role;
grant usage on schema auth,app_private to inforce;
grant select,insert,update,delete on all tables in schema auth,app_private to inforce;
grant usage on schema public to inforce;
grant select on public.team_members to inforce;

revoke execute on all functions in schema public from public,anon,authenticated;
grant execute on all functions in schema public to service_role;
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and (p.proname like 'accessible_%' or p.proname in ('is_team_member','is_team_admin','es_admin_real','es_mi_tarea','can_manage_company','company_login_lookup','next_pipeline_num','switch_time_session','task_session_totals','gen_random_uuid','unaccent')) loop
  execute format('grant execute on function %s to authenticated',f.signature);
 end loop;
end $$;
grant execute on function public.company_login_lookup(text) to anon;
grant execute on function public.ad_library_finish_crawl(uuid,timestamptz,boolean) to service_role;
grant execute on function public.ad_library_upsert_ads(uuid,timestamptz,jsonb) to service_role;

create or replace function app_private.notify_change() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 perform pg_notify('inforce_changes', json_build_object('table',TG_TABLE_NAME,'event',TG_OP)::text);
 return null;
end $$;
do $$ declare t record; begin
 for t in select tablename from pg_tables where schemaname='public' loop
  execute format('drop trigger if exists local_notify_change on public.%I',t.tablename);
  execute format('create trigger local_notify_change after insert or update or delete on public.%I for each statement execute function app_private.notify_change()',t.tablename);
 end loop;
end $$;
notify pgrst,'reload schema';
