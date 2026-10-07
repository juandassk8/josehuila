-- Operator-only recovery of source evidence. Never certifies a complete scan.
create or replace function public.ad_library_import_partial(
  p_request uuid, p_company text, p_page text, p_name text,
  p_observed timestamptz, p_ads jsonb, p_evidence jsonb
) returns jsonb language plpgsql set search_path=pg_catalog,public as $$
declare r public.ad_library_brand_requests; b public.ad_library_brands;
  candidate jsonb; completed jsonb; added integer := 0; media_jobs jsonb;
begin
  if p_page is null or p_page !~ '^[0-9]{5,25}$' or p_name is null or length(trim(p_name)) not between 1 and 160
    or p_observed is null or p_observed > now() or p_observed < '2020-01-01'
    or jsonb_typeof(p_ads) is distinct from 'array' or jsonb_array_length(p_ads) not between 1 and 5000
    or (p_evidence->>'sha256') is null or (p_evidence->>'sha256') !~ '^[a-f0-9]{64}$'
    then raise exception 'PARTIAL_EVIDENCE_INVALID' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('adlib-partial:'||(p_evidence->>'sha256'),0));
  select * into r from public.ad_library_brand_requests where id=p_request and company_id=p_company for update;
  if not found or r.input_url <> 'https://www.facebook.com/ads/library/?view_all_page_id='||p_page
    or r.status not in ('pending','needs_selection','ready')
    then raise exception 'REQUEST_CHANGED' using errcode='22023'; end if;
  if r.status='ready' then
    select * into b from public.ad_library_brands where id=r.brand_id and meta_page_id=p_page and source='meta_web' and country='ALL';
    if not found or not exists(select 1 from public.ad_library_follows where company_id=p_company and brand_id=b.id and active)
      then raise exception 'FOLLOW_CHANGED' using errcode='22023'; end if;
  else
    candidate := jsonb_build_array(jsonb_build_object('pageId',p_page,'name',p_name,
      'fanpageUrl',p_evidence->>'pageUrl'));
    update public.ad_library_brand_requests set status='needs_selection',candidates=candidate where id=r.id;
    completed := public.ad_library_complete_brand_request(r.id,p_company,p_page,'meta_web');
    select * into b from public.ad_library_brands where id=(completed->>'brandId')::uuid;
  end if;
  if exists(select 1 from jsonb_array_elements(p_ads) a where a->>'page_name' is distinct from p_name
    or a->>'source_ad_id' is null or a->>'source_ad_id' !~ '^[0-9]{5,25}$'
    or a->>'content_hash' is null or a->>'content_hash' !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(a->'version') is distinct from 'object')
    then raise exception 'PARTIAL_AD_INVALID' using errcode='22023'; end if;
  -- Concurrent native crawls can win the unique key; partial evidence never overwrites them.
  with incoming as (
    select * from jsonb_to_recordset(p_ads) as x(source_ad_id text,page_name text,body text,title text,
      caption text,cta text,landing_url text,media_type text,source_url text,source_start_at timestamptz,
      source_stop_at timestamptz,status text,content_hash text,version jsonb)
  ), inserted as (
    insert into public.ad_library_ads(brand_id,source_ad_id,page_name,body,title,caption,cta,landing_url,
      media_type,source_url,source_start_at,source_stop_at,status,content_hash,first_seen,last_seen,last_changed_at)
    select b.id,x.source_ad_id,x.page_name,x.body,x.title,x.caption,x.cta,x.landing_url,x.media_type,x.source_url,
      x.source_start_at,x.source_stop_at,x.status,x.content_hash,p_observed,p_observed,p_observed from incoming x
    on conflict(brand_id,source_ad_id) do nothing returning id,source_ad_id,content_hash
  ), versions as (
    insert into public.ad_library_versions(ad_id,content_hash,content,captured_at)
    select i.id,i.content_hash,x.version,p_observed from inserted i join incoming x using(source_ad_id)
    on conflict(ad_id,content_hash) do nothing
  ) select count(*) into added from inserted;
  if not exists(select 1 from public.ad_library_crawl_runs where brand_id=b.id
      and completion_evidence->>'sha256'=p_evidence->>'sha256') then
    insert into public.ad_library_crawl_runs(brand_id,started_at,finished_at,status,complete_scan,pages_seen,
      ads_seen,new_ads,changed_ads,error_code,collection_method,collector_engine,completion_evidence)
    values(b.id,p_observed,now(),'failed',false,1,jsonb_array_length(p_ads),added,0,'PARTIAL_SOURCE_EVIDENCE',
      'stored_capture','scrapegraph',p_evidence||jsonb_build_object('complete',false,'coverage','partial'));
  end if;
  -- Missing video files remain pending; only verified nonempty media is queued.
  select coalesce(jsonb_agg(jsonb_build_object('adId',a.id,'contentHash',a.content_hash,'media',x->'media')),'[]')
    into media_jobs from jsonb_array_elements(p_ads) x join public.ad_library_ads a
    on a.brand_id=b.id and a.source_ad_id=x->>'source_ad_id' and a.content_hash=x->>'content_hash'
    where jsonb_typeof(x->'media')='array' and jsonb_array_length(x->'media')>0
      and a.media_content_hash is distinct from a.content_hash;
  return jsonb_build_object('brandId',b.id,'newAds',added,'complete',false,'mediaJobs',media_jobs);
end $$;
revoke all on function public.ad_library_import_partial(uuid,text,text,text,timestamptz,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ad_library_import_partial(uuid,text,text,text,timestamptz,jsonb,jsonb) to service_role;
notify pgrst,'reload schema';
