-- Positive source evidence; apply after workspace + brand_requests migrations.
-- Existing page identities and private follows are never merged or renamed.
begin;
create or replace function public.ad_library_destination_domain(p_url text)
returns text language plpgsql immutable strict set search_path=pg_catalog,public as $$
declare authority text; domain text;
begin
  if length(p_url)>2048 or p_url !~* '^https?://' or p_url ~ '[[:space:]\\]' then return null; end if;
  authority := lower(substring(p_url from '(?i)^https?://([^/?#]+)'));
  if authority is null or authority ~ '@' then return null; end if;
  domain := regexp_replace(regexp_replace(authority,':(80|443)$',''),'\.$','');
  domain := regexp_replace(domain,'^www\.','');
  if domain !~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$' or domain ~ '\.\.'
    or domain ~ '(^|\.)(localhost|local|internal|test|invalid)$' then return null; end if;
  return domain;
end $$;

create table if not exists public.ad_library_page_domains (
  brand_id uuid not null references public.ad_library_brands(id) on delete cascade,
  domain text not null,
  kind text not null check(kind in ('ad_destination','fanpage_website')),
  evidence_key text not null,
  ad_id uuid references public.ad_library_ads(id) on delete cascade,
  example_url text not null,
  source_url text not null,
  first_observed_at timestamptz not null,
  last_observed_at timestamptz not null,
  primary key(brand_id,domain,kind,evidence_key),
  check(first_observed_at<=last_observed_at),
  check((kind='ad_destination' and ad_id is not null) or (kind='fanpage_website' and ad_id is null))
);
create index if not exists ad_library_page_domains_domain_idx on public.ad_library_page_domains(domain,brand_id);
alter table public.ad_library_page_domains enable row level security;
revoke all on public.ad_library_page_domains from public,anon,authenticated;
grant select,insert,update,delete on public.ad_library_page_domains to service_role;

create or replace function public.ad_library_observe_ad_domain(p_ad public.ad_library_ads,p_url text,p_at timestamptz)
returns void language plpgsql set search_path=pg_catalog,public as $$
declare d text := public.ad_library_destination_domain(p_url);
begin
  if d is null then return; end if;
  insert into public.ad_library_page_domains(brand_id,domain,kind,evidence_key,ad_id,example_url,source_url,first_observed_at,last_observed_at)
    values(p_ad.brand_id,d,'ad_destination',p_ad.id::text,p_ad.id,regexp_replace(p_url,'[?#].*$',''),
      'https://www.facebook.com/ads/library/?id='||p_ad.source_ad_id,p_at,p_at)
    on conflict(brand_id,domain,kind,evidence_key) do update set
      first_observed_at=least(ad_library_page_domains.first_observed_at,excluded.first_observed_at),
      last_observed_at=greatest(ad_library_page_domains.last_observed_at,excluded.last_observed_at),
      example_url=case when excluded.last_observed_at>=ad_library_page_domains.last_observed_at then excluded.example_url else ad_library_page_domains.example_url end;
end $$;

create or replace function public.ad_library_ad_domains_trigger()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare content jsonb; card jsonb;
begin
  perform public.ad_library_observe_ad_domain(new,new.landing_url,new.last_seen);
  select v.content into content from public.ad_library_versions v where v.ad_id=new.id and v.content_hash=new.content_hash;
  if jsonb_typeof(content->'cards')='array' then
    for card in select value from jsonb_array_elements(content->'cards') loop
      perform public.ad_library_observe_ad_domain(new,card->>'landing_url',new.last_seen);
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists ad_library_ad_domains on public.ad_library_ads;
create trigger ad_library_ad_domains after insert or update of landing_url,last_seen,content_hash on public.ad_library_ads
  for each row execute function public.ad_library_ad_domains_trigger();

create or replace function public.ad_library_version_domains_trigger()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare a public.ad_library_ads; card jsonb;
begin
  select * into a from public.ad_library_ads where id=new.ad_id;
  perform public.ad_library_observe_ad_domain(a,new.content->>'landing_url',new.captured_at);
  if jsonb_typeof(new.content->'cards')='array' then
    for card in select value from jsonb_array_elements(new.content->'cards') loop
      perform public.ad_library_observe_ad_domain(a,card->>'landing_url',new.captured_at);
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists ad_library_version_domains on public.ad_library_versions;
create trigger ad_library_version_domains after insert on public.ad_library_versions
  for each row execute function public.ad_library_version_domains_trigger();

create or replace function public.ad_library_profile_domains_trigger()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare page text; candidate jsonb; url text; d text;
begin
  if new.status<>'ready' or new.brand_id is null then return new; end if;
  select meta_page_id into page from public.ad_library_brands where id=new.brand_id;
  select value into candidate from jsonb_array_elements(new.candidates) where value->>'pageId'=page;
  if jsonb_typeof(candidate->'websites') is distinct from 'array' then return new; end if;
  for url in select value from jsonb_array_elements_text(candidate->'websites') limit 20 loop
    d := public.ad_library_destination_domain(url);
    if d is not null then
      insert into public.ad_library_page_domains(brand_id,domain,kind,evidence_key,example_url,source_url,first_observed_at,last_observed_at)
      values(new.brand_id,d,'fanpage_website',page,regexp_replace(url,'[?#].*$',''),
        'https://www.facebook.com/profile.php?id='||page,new.updated_at,new.updated_at)
      on conflict(brand_id,domain,kind,evidence_key) do update set
        last_observed_at=greatest(ad_library_page_domains.last_observed_at,excluded.last_observed_at),example_url=excluded.example_url;
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists ad_library_profile_domains on public.ad_library_brand_requests;
create trigger ad_library_profile_domains after update of status,candidates on public.ad_library_brand_requests
  for each row execute function public.ad_library_profile_domains_trigger();

-- Backfill only source observations actually stored; no DNS guesses or name matching.
do $$ declare a public.ad_library_ads; v record; card jsonb; begin
  for a in select * from public.ad_library_ads loop
    perform public.ad_library_observe_ad_domain(a,a.landing_url,a.last_seen);
  end loop;
  for v in select * from public.ad_library_versions where content->>'landing_url' is not null or jsonb_typeof(content->'cards')='array' loop
    select * into a from public.ad_library_ads where id=v.ad_id;
    perform public.ad_library_observe_ad_domain(a,v.content->>'landing_url',v.captured_at);
    if jsonb_typeof(v.content->'cards')='array' then
      for card in select value from jsonb_array_elements(v.content->'cards') loop
        perform public.ad_library_observe_ad_domain(a,card->>'landing_url',v.captured_at);
      end loop;
    end if;
  end loop;
end $$;

create or replace function public.ad_library_brand_network(p_company text)
returns jsonb language sql stable security invoker set search_path=pg_catalog,public as $$
 with edges as materialized (
  select e.brand_id as "brandId",e.domain,count(distinct e.ad_id) as "adCount",
    bool_or(e.kind='fanpage_website') as "profileLinked",min(e.first_observed_at) as "firstObserved",
    max(e.last_observed_at) as "lastObserved",
    (array_agg(e.example_url order by e.last_observed_at desc,e.evidence_key))[1] as "exampleUrl",
    (array_agg(e.source_url order by e.last_observed_at desc,e.evidence_key))[1] as "sourceUrl"
  from public.ad_library_page_domains e where exists(select 1 from public.ad_library_follows f
    where f.company_id=p_company and f.brand_id=e.brand_id and f.active)
  group by e.brand_id,e.domain order by max(e.last_observed_at) desc,e.brand_id,e.domain limit 5001
 ), visible as (select * from edges limit 5000)
 select jsonb_build_object('edges',coalesce((select jsonb_agg(visible) from visible),'[]'::jsonb),
   'truncated',(select count(*)>5000 from edges));
$$;

revoke all on function public.ad_library_destination_domain(text),public.ad_library_observe_ad_domain(public.ad_library_ads,text,timestamptz),
 public.ad_library_ad_domains_trigger(),public.ad_library_version_domains_trigger(),public.ad_library_profile_domains_trigger(),
 public.ad_library_brand_network(text) from public,anon,authenticated;
grant execute on function public.ad_library_destination_domain(text),public.ad_library_observe_ad_domain(public.ad_library_ads,text,timestamptz),
 public.ad_library_brand_network(text) to service_role;
notify pgrst,'reload schema';
commit;
