-- After admin_operations.sql and admin_proxy_pool.sql. Service-only encrypted API credential.
create table if not exists public.admin_scrapegraph_settings (
  id boolean primary key default true check(id),
  revision integer not null default 0 check(revision >= 0),
  encrypted_value text,
  updated_at timestamptz,
  updated_by uuid,
  checked_at timestamptz,
  check_status text check(check_status in ('connected','SGAI_AUTH_FAILED','SGAI_CREDITS_EXHAUSTED',
    'SGAI_RATE_LIMITED','SGAI_TRANSPORT_FAILED','SGAI_SERVICE_FAILED','SGAI_RESPONSE_INVALID','SGAI_RESPONSE_TOO_LARGE')),
  remaining numeric check(remaining >= 0 and remaining != 'NaN'::numeric),
  used numeric check(used >= 0 and used != 'NaN'::numeric)
);
insert into public.admin_scrapegraph_settings(id) values(true) on conflict do nothing;
alter table public.admin_scrapegraph_settings enable row level security;
revoke all on public.admin_scrapegraph_settings from public,anon,authenticated;
grant select,update on public.admin_scrapegraph_settings to service_role;
alter table public.admin_operations_audit drop constraint if exists admin_operations_audit_action_check;
alter table public.admin_operations_audit add constraint admin_operations_audit_action_check
  check(action in ('settings_saved','crawl_requested','proxies_saved','scrapegraph_saved','scrapegraph_checked'));

create or replace function public.admin_save_scrapegraph(p_actor uuid,p_revision integer,p_encrypted text)
returns jsonb language plpgsql set search_path=pg_catalog,public as $$
declare previous public.admin_scrapegraph_settings; current_row public.admin_scrapegraph_settings; actor text;
begin
  select name into actor from public.team_members where id=p_actor and role='admin' and active is distinct from false;
  if not found then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
  select * into previous from public.admin_scrapegraph_settings where id=true for update;
  if previous.revision is distinct from p_revision then raise exception 'SCRAPEGRAPH_CONFLICT' using errcode='40001'; end if;
  if p_encrypted is not null and (length(p_encrypted)>800 or
    p_encrypted !~ '^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+$')
    then raise exception 'INVALID_CREDENTIAL' using errcode='22023'; end if;
  update public.admin_scrapegraph_settings set encrypted_value=p_encrypted,revision=revision+1,
    updated_at=now(),updated_by=p_actor,checked_at=null,check_status=null,remaining=null,used=null
    where id=true returning * into current_row;
  insert into public.admin_operations_audit(actor_id,actor_name,action,before_value,after_value)
    values(p_actor,coalesce(actor,'Administrador'),'scrapegraph_saved',
      jsonb_build_object('revision',previous.revision,'configured',previous.encrypted_value is not null),
      jsonb_build_object('revision',current_row.revision,'configured',current_row.encrypted_value is not null));
  return jsonb_build_object('revision',current_row.revision);
end $$;

create or replace function public.admin_check_scrapegraph(p_actor uuid,p_revision integer,p_status text,p_remaining numeric,p_used numeric)
returns jsonb language plpgsql set search_path=pg_catalog,public as $$
declare previous public.admin_scrapegraph_settings; actor text;
begin
  select name into actor from public.team_members where id=p_actor and role='admin' and active is distinct from false;
  if not found then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
  select * into previous from public.admin_scrapegraph_settings where id=true for update;
  if previous.revision is distinct from p_revision then raise exception 'SCRAPEGRAPH_CONFLICT' using errcode='40001'; end if;
  if previous.encrypted_value is null or p_status is null or p_status not in ('connected','SGAI_AUTH_FAILED','SGAI_CREDITS_EXHAUSTED',
    'SGAI_RATE_LIMITED','SGAI_TRANSPORT_FAILED','SGAI_SERVICE_FAILED','SGAI_RESPONSE_INVALID','SGAI_RESPONSE_TOO_LARGE')
    or (p_status='connected' and p_remaining is null)
    or (p_status<>'connected' and (p_remaining is not null or p_used is not null))
    then raise exception 'INVALID_CHECK' using errcode='22023'; end if;
  update public.admin_scrapegraph_settings set checked_at=clock_timestamp(),check_status=p_status,remaining=p_remaining,used=p_used where id=true;
  insert into public.admin_operations_audit(actor_id,actor_name,action,after_value)
    values(p_actor,coalesce(actor,'Administrador'),'scrapegraph_checked',
      jsonb_build_object('revision',p_revision,'status',p_status,'remaining',p_remaining));
  return jsonb_build_object('revision',p_revision);
end $$;
revoke all on function public.admin_save_scrapegraph(uuid,integer,text), public.admin_check_scrapegraph(uuid,integer,text,numeric,numeric) from public,anon,authenticated;
grant execute on function public.admin_save_scrapegraph(uuid,integer,text), public.admin_check_scrapegraph(uuid,integer,text,numeric,numeric) to service_role;
notify pgrst,'reload schema';
