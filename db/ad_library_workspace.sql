-- Additive workspace analytics. Catalog access remains service-role only.
alter table public.ad_library_media add column if not exists poster_object_key text;
alter table public.ad_library_media add column if not exists width integer;
alter table public.ad_library_media add column if not exists height integer;
alter table public.ad_library_media add column if not exists duration_seconds numeric;

create table if not exists public.ad_library_saves (
  company_id text not null references public.companies(id) on delete cascade,
  user_id uuid not null,
  ad_id uuid not null references public.ad_library_ads(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (company_id,user_id,ad_id)
);
alter table public.ad_library_saves enable row level security;
revoke all on public.ad_library_saves from public, anon, authenticated;
grant all on public.ad_library_saves to service_role;

create or replace view public.ad_library_catalog with (security_invoker=true) as
select a.*,
  greatest(1, floor(extract(epoch from (
    least(a.last_seen,coalesce(a.source_stop_at,a.last_seen)) - coalesce(a.source_start_at,a.first_seen)
  ))/86400)::integer + 1) as running_days,
  (coalesce(a.source_start_at,a.first_seen) at time zone 'UTC')::date as launch_day,
  regexp_replace(coalesce(a.landing_url,''),'[?#].*$','') as landing_key,
  left(split_part(replace(coalesce(nullif(trim(a.body),''),nullif(trim(a.title),''),a.caption,''),E'\r',''),E'\n',1),220) as hook,
  lower(coalesce(a.body,'')||' '||coalesce(a.title,'')||' '||coalesce(a.caption,'')||' '||coalesce(a.page_name,'')) as search_text
from public.ad_library_ads a;
revoke all on public.ad_library_catalog from public, anon, authenticated;
grant select on public.ad_library_catalog to service_role;

create or replace function public.ad_library_workspace_rows(
  p_company text, p_user uuid, p_brand uuid default null, p_status text default 'all',
  p_search text default '', p_format text default 'all', p_saved boolean default false,
  p_group_type text default '', p_group_value text default ''
) returns setof public.ad_library_catalog language sql stable security invoker as $$
  select a.* from public.ad_library_catalog a
  where exists(select 1 from public.ad_library_follows f where f.company_id=p_company and f.brand_id=a.brand_id and f.active)
    and (p_brand is null or a.brand_id=p_brand)
    and (p_status='all' or (p_status='active' and a.status='active') or (p_status='historical' and a.status<>'active'))
    and (p_format='all' or a.media_type=p_format)
    and (p_search='' or a.search_text like '%'||replace(replace(replace(lower(p_search),E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_')||'%')
    and (not p_saved or exists(select 1 from public.ad_library_saves s where s.company_id=p_company and s.user_id=p_user and s.ad_id=a.id))
    and (p_group_type='' or (p_group_type='landing' and a.landing_key=p_group_value)
      or (p_group_type='hook' and a.hook=p_group_value) or (p_group_type='launch' and a.launch_day::text=p_group_value));
$$;

create or replace function public.ad_library_workspace_page(
  p_company text,p_user uuid,p_brand uuid default null,p_status text default 'all',
  p_search text default '',p_format text default 'all',p_saved boolean default false,
  p_group_type text default '',p_group_value text default '',p_sort text default 'newest',
  p_after numeric default null,p_after_id uuid default null,p_limit integer default 31
) returns jsonb language sql stable security invoker set search_path=public as $$
  with ranked as (
    select a.*,case when p_sort='longest' then running_days::numeric else extract(epoch from first_seen) end as sort_value,
      exists(select 1 from public.ad_library_saves s where s.company_id=p_company and s.user_id=p_user and s.ad_id=a.id) as saved
    from public.ad_library_workspace_rows(p_company,p_user,p_brand,p_status,p_search,p_format,p_saved,p_group_type,p_group_value) a
  ), paged as (
    select * from ranked where p_after is null or (sort_value,id)<(p_after,p_after_id)
    order by sort_value desc,id desc limit least(greatest(p_limit,1),51)
  ) select coalesce(jsonb_agg(to_jsonb(paged)-'search_text' order by sort_value desc,id desc),'[]'::jsonb) from paged;
$$;

create or replace function public.ad_library_workspace_insights(
  p_company text,p_user uuid,p_brand uuid default null,p_status text default 'all',
  p_search text default '',p_format text default 'all',p_saved boolean default false,
  p_group_type text default '',p_group_value text default ''
) returns jsonb language sql stable security invoker set search_path=public as $$
  with rows as materialized (
    select status,media_type,running_days,first_seen,last_seen,landing_key,landing_url,hook,launch_day,source_start_at
    from public.ad_library_workspace_rows(p_company,p_user,p_brand,p_status,p_search,p_format,p_saved,p_group_type,p_group_value)
  ), formats as (
    select coalesce(media_type,'other') as name,count(*) as total from rows group by 1
  ), destinations as (
    select landing_key as value,count(*) as total,count(*) filter(where status='active') as active,
      min(landing_url) as url,max(running_days) as days
    from rows where landing_key<>'' group by landing_key order by total desc,landing_key limit 60
  ), hooks as (
    select hook as value,count(*) as total,count(*) filter(where status='active') as active,max(running_days) as days
    from rows where hook<>'' group by hook order by days desc,hook limit 60
  ), launches as (
    select launch_day::text as value,count(*) as total,count(*) filter(where status='active') as active,
      count(*) filter(where source_start_at is null) as inferred,max(running_days) as days
    from rows group by launch_day order by launch_day desc limit 60
  ) select jsonb_build_object(
    'total',(select count(*) from rows),'active',(select count(*) from rows where status='active'),
    'longRunning',(select count(*) from rows where status='active' and running_days>=30),
    'firstSeen',(select min(first_seen) from rows),'lastSeen',(select max(last_seen) from rows),
    'formats',coalesce((select jsonb_agg(formats order by total desc,name) from formats),'[]'::jsonb),
    'destinations',coalesce((select jsonb_agg(destinations order by total desc,value) from destinations),'[]'::jsonb),
    'hooks',coalesce((select jsonb_agg(hooks order by days desc,value) from hooks),'[]'::jsonb),
    'launches',coalesce((select jsonb_agg(launches order by value desc) from launches),'[]'::jsonb)
  );
$$;

revoke all on function public.ad_library_workspace_rows(text,uuid,uuid,text,text,text,boolean,text,text) from public,anon,authenticated;
revoke all on function public.ad_library_workspace_page(text,uuid,uuid,text,text,text,boolean,text,text,text,numeric,uuid,integer) from public,anon,authenticated;
revoke all on function public.ad_library_workspace_insights(text,uuid,uuid,text,text,text,boolean,text,text) from public,anon,authenticated;
grant execute on function public.ad_library_workspace_rows(text,uuid,uuid,text,text,text,boolean,text,text) to service_role;
grant execute on function public.ad_library_workspace_page(text,uuid,uuid,text,text,text,boolean,text,text,text,numeric,uuid,integer) to service_role;
grant execute on function public.ad_library_workspace_insights(text,uuid,uuid,text,text,text,boolean,text,text) to service_role;
notify pgrst, 'reload schema';
