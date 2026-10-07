-- Only on an isolated PostgreSQL cluster with the library migrations applied.
insert into public.companies(id) values('partial-test'),('other-company');
insert into public.ad_library_brand_requests(id,company_id,created_by,input_url,url_hash) values
('10000000-0000-4000-8000-000000000001','partial-test','00000000-0000-4000-8000-000000000001',
 'https://www.facebook.com/ads/library/?view_all_page_id=12345',repeat('1',64));
do $$ begin
 assert not has_function_privilege('anon','public.ad_library_import_partial(uuid,text,text,text,timestamptz,jsonb,jsonb)','execute');
 assert not has_function_privilege('authenticated','public.ad_library_import_partial(uuid,text,text,text,timestamptz,jsonb,jsonb)','execute');
end $$;
set role service_role;
do $$ declare
 req uuid := '10000000-0000-4000-8000-000000000001'; result jsonb; bid uuid;
 observed timestamptz := now()-interval '1 hour';
 evidence jsonb := jsonb_build_object('sha256',repeat('a',64),'pageUrl','https://www.facebook.com/example');
 ads jsonb := jsonb_build_array(jsonb_build_object('source_ad_id','54321','page_name','Example','body','source copy',
   'source_url','https://www.facebook.com/ads/library/?id=54321','status','active','media_type','video',
   'content_hash',repeat('a',64),'version',jsonb_build_object('body','source copy'),'media','[]'::jsonb));
begin
 begin
   perform public.ad_library_import_partial(req,'other-company','12345','Example',observed,ads,evidence);
   raise exception 'CROSS_COMPANY_ALLOWED'; exception when invalid_parameter_value then null;
 end;
 result := public.ad_library_import_partial(req,'partial-test','12345','Example',observed,ads,evidence);
 bid := (result->>'brandId')::uuid;
 assert result->>'newAds'='1' and result->>'complete'='false' and result->'mediaJobs'='[]'::jsonb;
 assert (select status='ready' and brand_id=bid from public.ad_library_brand_requests where id=req);
 assert (select count(*)=1 from public.ad_library_follows where company_id='partial-test' and brand_id=bid and active);
 assert (select last_complete_scan_at is null from public.ad_library_brands where id=bid);
 assert (select not complete_scan and status='failed' and collection_method='stored_capture' from public.ad_library_crawl_runs where brand_id=bid);
 assert (select captured_at=observed from public.ad_library_versions);
 -- Replays must not rewrite a newer native observation, its status, media or content.
 update public.ad_library_ads set body='new native copy',status='inactive',content_hash=repeat('b',64),last_seen=now() where brand_id=bid;
 result := public.ad_library_import_partial(req,'partial-test','12345','Example',observed,ads,evidence);
 assert result->>'newAds'='0';
 assert (select body='new native copy' and status='inactive' and content_hash=repeat('b',64) and first_seen=observed and last_seen>observed from public.ad_library_ads where brand_id=bid);
 assert (select count(*)=1 from public.ad_library_crawl_runs where brand_id=bid);
 assert (select count(*)=1 from public.ad_library_versions);
 update public.ad_library_brand_requests set status='cancelled' where id=req;
 begin
   perform public.ad_library_import_partial(req,'partial-test','12345','Example',observed,ads,evidence);
   raise exception 'CANCELLED_ALLOWED'; exception when invalid_parameter_value then null;
 end;
 update public.ad_library_brand_requests set status='resolving',lease_token=gen_random_uuid(),lease_until=now()+interval '10 minutes' where id=req;
 begin
   perform public.ad_library_import_partial(req,'partial-test','12345','Example',observed,ads,evidence);
   raise exception 'LEASE_ALLOWED'; exception when invalid_parameter_value then null;
 end;
 update public.ad_library_brand_requests set status='pending',brand_id=null where id=req;
 begin
   perform public.ad_library_import_partial(req,'partial-test','12345','Example',observed,
     jsonb_set(ads,'{0,page_name}','"Wrong page"'),evidence);
   raise exception 'WRONG_PAGE_ALLOWED'; exception when invalid_parameter_value then null;
 end;
 assert (select status='pending' and brand_id is null from public.ad_library_brand_requests where id=req), 'All resolution writes must roll back';
end $$;
reset role;
select 'PASS: isolated partial import, RLS, company scope, cancellation, leases, rollback, replay, preserved native data and no false completeness';
