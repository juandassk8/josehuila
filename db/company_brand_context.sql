-- Contexto manual de Universo. Conserva productos, voz, IDs y RLS existentes.
begin;
alter table public.company_voice_profile
  add column if not exists brand_context jsonb not null default '{}'::jsonb;
alter table public.company_expertise_documents
  add column if not exists updated_at timestamptz not null default now();
create or replace function public.touch_brand_document() returns trigger language plpgsql as $$
begin new.updated_at := clock_timestamp(); return new; end $$;
drop trigger if exists touch_brand_document on public.company_expertise_documents;
create trigger touch_brand_document before update on public.company_expertise_documents
  for each row execute function public.touch_brand_document();
-- Same definition as deploy/vps/permissions.sql. Also available when this
-- additive migration runs during a new installation, before local permissions.
create or replace function public.can_manage_company(p_id text) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select is_team_admin() or exists(select 1 from companies where id=p_id and owner_user_id=auth.uid()) or exists(
 select 1 from company_team_members where company_id=p_id and (auth_user_id=auth.uid() or lower(email)=lower(auth.jwt()->>'email')) and (is_owner or roles && array['owner','project_manager'])) $$;
-- The frontend exposes editing only to brand managers; enforce the same rule.
do $$ declare tab text; begin
  foreach tab in array array['company_voice_profile', 'company_expertise_documents'] loop
    execute format('drop policy if exists brand_manager_insert on public.%I', tab);
    execute format('create policy brand_manager_insert on public.%I as restrictive for insert to authenticated with check(public.can_manage_company(company_id))', tab);
    execute format('drop policy if exists brand_manager_update on public.%I', tab);
    execute format('create policy brand_manager_update on public.%I as restrictive for update to authenticated using(public.can_manage_company(company_id)) with check(public.can_manage_company(company_id))', tab);
    execute format('drop policy if exists brand_manager_delete on public.%I', tab);
    execute format('create policy brand_manager_delete on public.%I as restrictive for delete to authenticated using(public.can_manage_company(company_id))', tab);
  end loop;
end $$;
notify pgrst, 'reload schema';
commit;
