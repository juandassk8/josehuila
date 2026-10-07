-- Apply after ad_library_collectors.sql. All functions are service-only; the API requires an active team admin.
create table if not exists public.admin_collection_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default true,
  changes_hours integer not null default 6 check (changes_hours between 1 and 168),
  quiet_hours integer not null default 24 check (quiet_hours between 1 and 168 and quiet_hours >= changes_hours),
  error_hours integer not null default 6 check (error_hours between 1 and 24),
  scrapling_enabled boolean not null default true,
  revision integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.admin_collection_settings(id) values(true) on conflict do nothing;

create table if not exists public.admin_operations_audit (
  id bigint generated always as identity primary key,
  actor_id uuid not null,
  actor_name text not null,
  action text not null check (action in ('settings_saved','crawl_requested')),
  brand_id uuid,
  before_value jsonb,
  after_value jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists admin_operations_audit_recent_idx on public.admin_operations_audit(created_at desc, id desc);
create index if not exists ad_library_runs_recent_idx on public.ad_library_crawl_runs(started_at desc, id desc);
alter table public.admin_collection_settings enable row level security;
alter table public.admin_operations_audit enable row level security;
revoke all on public.admin_collection_settings, public.admin_operations_audit from public, anon, authenticated;
grant select,insert,update on public.admin_collection_settings, public.admin_operations_audit to service_role;
grant usage,select on sequence public.admin_operations_audit_id_seq to service_role;

-- Lock + revision comparison + audit are one transaction, including validation by DB constraints.
create or replace function public.admin_save_collection_settings(p_actor uuid, p_revision integer, p_settings jsonb)
returns jsonb language plpgsql set search_path = pg_catalog, public as $$
declare previous public.admin_collection_settings; current_row public.admin_collection_settings; actor text;
begin
  select name into actor from public.team_members where id = p_actor and role = 'admin' and active is distinct from false;
  if not found then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  select * into previous from public.admin_collection_settings where id = true for update;
  if previous.revision is distinct from p_revision then raise exception 'SETTINGS_CONFLICT' using errcode = '40001'; end if;
  if jsonb_typeof(p_settings) is distinct from 'object'
    or (select count(*) from jsonb_object_keys(p_settings)) <> 5
    or not p_settings ?& array['enabled','changes_hours','quiet_hours','error_hours','scrapling_enabled']
    or jsonb_typeof(p_settings->'enabled') is distinct from 'boolean'
    or jsonb_typeof(p_settings->'scrapling_enabled') is distinct from 'boolean'
    or (p_settings->>'changes_hours') !~ '^[0-9]+$'
    or (p_settings->>'quiet_hours') !~ '^[0-9]+$'
    or (p_settings->>'error_hours') !~ '^[0-9]+$'
  then raise exception 'INVALID_SETTINGS' using errcode = '22023'; end if;
  update public.admin_collection_settings set
    enabled = (p_settings->>'enabled')::boolean,
    changes_hours = (p_settings->>'changes_hours')::integer,
    quiet_hours = (p_settings->>'quiet_hours')::integer,
    error_hours = (p_settings->>'error_hours')::integer,
    scrapling_enabled = (p_settings->>'scrapling_enabled')::boolean,
    revision = revision + 1, updated_at = now(), updated_by = p_actor
  where id = true returning * into current_row;
  insert into public.admin_operations_audit(actor_id,actor_name,action,before_value,after_value)
    values(p_actor,coalesce(actor,'Administrador'),'settings_saved',to_jsonb(previous) - 'id',to_jsonb(current_row) - 'id');
  return to_jsonb(current_row) - 'id';
end $$;

create or replace function public.admin_operations_summary()
returns jsonb language sql stable set search_path = pg_catalog, public as $$
  select jsonb_build_object(
    'companies', (select count(*) from public.companies),
    'members', (select count(*) from public.team_members where active is distinct from false),
    'brands', (select count(*) from public.ad_library_brands),
    'followed_brands', (select count(distinct brand_id) from public.ad_library_follows where active),
    'ads', (select count(*) from public.ad_library_ads),
    'active_ads', (select count(*) from public.ad_library_ads where status = 'active'),
    'media_pending', (select count(*) from public.ad_library_ads where media_content_hash is distinct from content_hash),
    'media_failed', (select count(*) from public.ad_library_ads where media_error is not null),
    'media_files', (select count(*) from public.ad_library_media),
    'media_bytes', (select coalesce(sum(bytes),0) from public.ad_library_media),
    'runs_24h', (select count(*) from public.ad_library_crawl_runs where started_at >= now() - interval '24 hours'),
    'failed_24h', (select count(*) from public.ad_library_crawl_runs where started_at >= now() - interval '24 hours' and status = 'failed'),
    'complete_24h', (select count(*) from public.ad_library_crawl_runs where started_at >= now() - interval '24 hours' and complete_scan),
    'attention', (select count(*) from public.ad_library_brands b where (b.last_crawl_status = 'failed' or b.last_complete_scan_at is null)
      and exists(select 1 from public.ad_library_follows f where f.brand_id = b.id and f.active))
  );
$$;

create or replace function public.admin_operations_brands(p_search text default '', p_attention boolean default false, p_offset integer default 0)
returns jsonb language sql stable set search_path = pg_catalog, public as $$
  with matches as (
    select b.* from public.ad_library_brands b
    where (strpos(lower(b.name),lower(left(p_search,100))) > 0 or strpos(b.meta_page_id,left(p_search,100)) > 0)
      and (not p_attention or ((b.last_crawl_status = 'failed' or b.last_complete_scan_at is null)
        and exists(select 1 from public.ad_library_follows f where f.brand_id = b.id and f.active)))
  ), page as (select * from matches order by lower(name),id limit 25 offset greatest(0,least(p_offset,100000)))
  select jsonb_build_object('total',(select count(*) from matches), 'rows',coalesce((select jsonb_agg(to_jsonb(x) order by lower(x.name),x.id) from (
    select p.*,
      (select count(*) from public.ad_library_ads a where a.brand_id = p.id) as ads,
      (select count(*) from public.ad_library_ads a where a.brand_id = p.id and a.status = 'active') as active_ads,
      (select count(*) from public.ad_library_follows f where f.brand_id = p.id and f.active) as followers
    from page p
  ) x),'[]'::jsonb));
$$;

create or replace function public.admin_operations_runs(p_status text default '', p_brand uuid default null, p_offset integer default 0)
returns jsonb language sql stable set search_path = pg_catalog, public as $$
  with matches as (
    select r.id,r.brand_id,r.started_at,r.finished_at,r.status,r.complete_scan,r.pages_seen,r.ads_seen,
      r.new_ads,r.changed_ads,r.error_code,r.collection_method,r.collector_engine,r.collector_attempts,
      b.name as brand_name
    from public.ad_library_crawl_runs r join public.ad_library_brands b on b.id = r.brand_id
    where (p_status = '' or r.status = p_status) and (p_brand is null or r.brand_id = p_brand)
  ), page as (select * from matches order by started_at desc,id desc limit 25 offset greatest(0,least(p_offset,100000)))
  select jsonb_build_object('total',(select count(*) from matches),'rows',
    coalesce((select jsonb_agg(to_jsonb(p) order by p.started_at desc,p.id desc) from page p),'[]'::jsonb));
$$;

revoke all on function public.admin_save_collection_settings(uuid,integer,jsonb), public.admin_operations_summary(),
  public.admin_operations_brands(text,boolean,integer), public.admin_operations_runs(text,uuid,integer) from public,anon,authenticated;
grant execute on function public.admin_save_collection_settings(uuid,integer,jsonb), public.admin_operations_summary(),
  public.admin_operations_brands(text,boolean,integer), public.admin_operations_runs(text,uuid,integer) to service_role;
notify pgrst, 'reload schema';
