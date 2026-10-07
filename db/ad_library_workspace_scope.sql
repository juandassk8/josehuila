-- New RPC names preserve compatibility with already-running API versions.
begin;
create or replace function public.ad_library_workspace_scope_rows(
  p_company text,p_user uuid,p_brand uuid default null,p_status text default 'all',
  p_search text default '',p_format text default 'all',p_saved boolean default false,
  p_group_type text default '',p_group_value text default '',p_brands uuid[] default null
) returns setof public.ad_library_catalog language sql stable security invoker set search_path=pg_catalog,public as $$
 select a.* from public.ad_library_workspace_rows(p_company,p_user,p_brand,p_status,p_search,p_format,p_saved,
   case when p_group_type='domain' then '' else p_group_type end,p_group_value) a
 where (p_brands is null or a.brand_id=any(p_brands))
   and (p_group_type<>'domain' or exists(select 1 from public.ad_library_page_domains e where e.ad_id=a.id and e.domain=p_group_value));
$$;

create or replace function public.ad_library_workspace_scope_page(
  p_company text,p_user uuid,p_brand uuid default null,p_status text default 'all',
  p_search text default '',p_format text default 'all',p_saved boolean default false,
  p_group_type text default '',p_group_value text default '',p_sort text default 'newest',
  p_after numeric default null,p_after_id uuid default null,p_limit integer default 31,p_brands uuid[] default null
) returns jsonb language sql stable security invoker set search_path=pg_catalog,public as $$
 with ranked as (
   select a.*,case when p_sort='longest' then running_days::numeric else extract(epoch from first_seen) end as sort_value,
     exists(select 1 from public.ad_library_saves s where s.company_id=p_company and s.user_id=p_user and s.ad_id=a.id) as saved
   from public.ad_library_workspace_scope_rows(p_company,p_user,p_brand,p_status,p_search,p_format,p_saved,p_group_type,p_group_value,p_brands) a
 ), paged as (
   select * from ranked where p_after is null or (sort_value,id)<(p_after,p_after_id)
   order by sort_value desc,id desc limit least(greatest(p_limit,1),51)
 ) select coalesce(jsonb_agg(to_jsonb(paged)-'search_text' order by sort_value desc,id desc),'[]'::jsonb) from paged;
$$;

create or replace function public.ad_library_workspace_scope_insights(
  p_company text,p_user uuid,p_brand uuid default null,p_status text default 'all',
  p_search text default '',p_format text default 'all',p_saved boolean default false,
  p_group_type text default '',p_group_value text default '',p_brands uuid[] default null
) returns jsonb language sql stable security invoker set search_path=pg_catalog,public as $$
 with rows as materialized (
   select a.brand_id,a.status,a.media_type,a.running_days,a.first_seen,a.last_seen,a.landing_key,a.landing_url,a.hook,a.launch_day,a.source_start_at,
     b.name as page_name,b.meta_page_id
   from public.ad_library_workspace_scope_rows(p_company,p_user,p_brand,p_status,p_search,p_format,p_saved,p_group_type,p_group_value,p_brands) a
   join public.ad_library_brands b on b.id=a.brand_id
 ), formats as (
   select coalesce(media_type,'other') as name,count(*) as total from rows group by 1
 ), destination_pages as (
   select landing_key,brand_id as id,page_name as name,meta_page_id as "pageId",count(*) as total
   from rows where landing_key<>'' group by landing_key,brand_id,page_name,meta_page_id
 ), destinations as (
   select landing_key as value,count(*) as total,count(*) filter(where status='active') as active,
     min(landing_url) as url,max(running_days) as days,
     (select jsonb_agg(to_jsonb(dp)-'landing_key' order by dp.total desc,dp.name,dp.id) from destination_pages dp where dp.landing_key=r.landing_key) as fanpages
   from rows r where landing_key<>'' group by landing_key order by total desc,landing_key limit 60
 ), pages as (
   select brand_id as id,page_name as name,meta_page_id as "pageId",count(*) as total,count(*) filter(where status='active') as active
   from rows group by brand_id,page_name,meta_page_id
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
   'fanpages',coalesce((select jsonb_agg(pages order by total desc,name,id) from pages),'[]'::jsonb),
   'hooks',coalesce((select jsonb_agg(hooks order by days desc,value) from hooks),'[]'::jsonb),
   'launches',coalesce((select jsonb_agg(launches order by value desc) from launches),'[]'::jsonb)
 );
$$;
revoke all on function public.ad_library_workspace_scope_rows(text,uuid,uuid,text,text,text,boolean,text,text,uuid[]),
 public.ad_library_workspace_scope_page(text,uuid,uuid,text,text,text,boolean,text,text,text,numeric,uuid,integer,uuid[]),
 public.ad_library_workspace_scope_insights(text,uuid,uuid,text,text,text,boolean,text,text,uuid[]) from public,anon,authenticated;
grant execute on function public.ad_library_workspace_scope_rows(text,uuid,uuid,text,text,text,boolean,text,text,uuid[]),
 public.ad_library_workspace_scope_page(text,uuid,uuid,text,text,text,boolean,text,text,text,numeric,uuid,integer,uuid[]),
 public.ad_library_workspace_scope_insights(text,uuid,uuid,text,text,text,boolean,text,text,uuid[]) to service_role;
notify pgrst,'reload schema';
commit;
