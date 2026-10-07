-- Apply after admin_operations.sql. Credentials reach PostgreSQL only as AES-GCM ciphertext.
create table if not exists public.admin_proxy_settings (
  id boolean primary key default true check(id),
  revision integer not null default 0 check(revision >= 0),
  encrypted_value text,
  routes jsonb not null default '[]'::jsonb,
  updated_at timestamptz,
  updated_by uuid
);
insert into public.admin_proxy_settings(id) values(true) on conflict do nothing;
alter table public.admin_proxy_settings enable row level security;
revoke all on public.admin_proxy_settings from public,anon,authenticated;
grant select,update on public.admin_proxy_settings to service_role;
alter table public.admin_operations_audit drop constraint if exists admin_operations_audit_action_check;
alter table public.admin_operations_audit add constraint admin_operations_audit_action_check
  check(action in ('settings_saved','crawl_requested','proxies_saved'));

create or replace function public.admin_save_proxy_settings(p_actor uuid,p_revision integer,p_encrypted text,p_routes jsonb)
returns jsonb language plpgsql set search_path=pg_catalog,public as $$
declare previous public.admin_proxy_settings; current_row public.admin_proxy_settings; actor text; item jsonb; i integer:=0;
begin
  select name into actor from public.team_members where id=p_actor and role='admin' and active is distinct from false;
  if not found then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
  select * into previous from public.admin_proxy_settings where id=true for update;
  if previous.revision is distinct from p_revision then raise exception 'PROXIES_CONFLICT' using errcode='40001'; end if;
  if p_encrypted is null or length(p_encrypted)>6000 or p_encrypted !~ '^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+$'
    or jsonb_typeof(p_routes) is distinct from 'array' then raise exception 'INVALID_PROXIES' using errcode='22023'; end if;
  if jsonb_array_length(p_routes) not between 1 and 2 then raise exception 'INVALID_PROXIES' using errcode='22023'; end if;
  for item in select value from jsonb_array_elements(p_routes) loop
    i:=i+1;
    if jsonb_typeof(item) is distinct from 'object' then raise exception 'INVALID_PROXIES' using errcode='22023'; end if;
    if (select count(*) from jsonb_object_keys(item)) <> 3 or not item ?& array['slot','server','hasCredentials']
      or (item->>'slot') is distinct from (case i when 1 then 'primary' else 'backup' end)
      or jsonb_typeof(item->'hasCredentials') is distinct from 'boolean'
      or jsonb_typeof(item->'server') is distinct from 'string' or length(item->>'server')>300
      or (item->>'server') !~ '^(http|socks5)://[a-zA-Z0-9.-]+:[0-9]{1,5}$'
      then raise exception 'INVALID_PROXIES' using errcode='22023'; end if;
  end loop;
  update public.admin_proxy_settings set encrypted_value=p_encrypted,routes=p_routes,revision=revision+1,
    updated_at=now(),updated_by=p_actor where id=true returning * into current_row;
  insert into public.admin_operations_audit(actor_id,actor_name,action,before_value,after_value)
    values(p_actor,coalesce(actor,'Administrador'),'proxies_saved',jsonb_build_object('revision',previous.revision,'routes',previous.routes),
      jsonb_build_object('revision',current_row.revision,'routes',current_row.routes));
  return jsonb_build_object('revision',current_row.revision,'updated_at',current_row.updated_at);
end $$;
revoke all on function public.admin_save_proxy_settings(uuid,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.admin_save_proxy_settings(uuid,integer,text,jsonb) to service_role;
notify pgrst,'reload schema';
