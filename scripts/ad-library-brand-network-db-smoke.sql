-- Run only in the isolated test cluster, after all library/network migrations.
insert into companies(id) values('network-a'),('network-b');
insert into ad_library_brands(id,source,meta_page_id,name) values
 ('10000000-0000-4000-8000-000000000001','meta_web','12345','Same name'),
 ('20000000-0000-4000-8000-000000000002','meta_web','23456','Same name'),
 ('30000000-0000-4000-8000-000000000003','meta_web','34567','Private page');
insert into ad_library_follows(company_id,brand_id,active) values
 ('network-a','10000000-0000-4000-8000-000000000001',true),('network-a','20000000-0000-4000-8000-000000000002',true),
 ('network-b','30000000-0000-4000-8000-000000000003',true);
do $$ begin
 assert public.ad_library_destination_domain('https://WWW.Brand.COM/products/a?utm=1#fragment')='brand.com';
 assert public.ad_library_destination_domain('http://brand.com:80/b')='brand.com';
 assert public.ad_library_destination_domain('https://brand.net')='brand.net';
 assert public.ad_library_destination_domain('https://gt.brand.com')='gt.brand.com';
 assert public.ad_library_destination_domain('https://user:secret@brand.com') is null;
 assert public.ad_library_destination_domain('javascript:alert(1)') is null;
 assert public.ad_library_destination_domain('https://127.0.0.1/path') is null;
 assert public.ad_library_destination_domain('https://host.local/path') is null;
 assert not has_table_privilege('authenticated','public.ad_library_page_domains','select');
 assert not has_function_privilege('anon','public.ad_library_brand_network(text)','execute');
 assert not has_function_privilege('authenticated','public.ad_library_workspace_scope_page(text,uuid,uuid,text,text,text,boolean,text,text,text,numeric,uuid,integer,uuid[])','execute');
end $$;
set role service_role;
insert into ad_library_ads(id,brand_id,source_ad_id,page_name,landing_url,source_url,status,media_type,content_hash,first_seen,last_seen) values
 ('a0000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','54321','Same name','https://www.brand.com/p?utm=a','https://www.facebook.com/ads/library/?id=54321','active','image',repeat('a',64),'2026-10-01','2026-10-02'),
 ('b0000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','65432','Same name','https://www.brand.com/p?utm=b','https://www.facebook.com/ads/library/?id=65432','active','video',repeat('b',64),'2026-10-01','2026-10-02'),
 ('c0000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000003','76543','Private page','https://brand.com/p','https://www.facebook.com/ads/library/?id=76543','active','video',repeat('c',64),'2026-10-01','2026-10-02');
insert into ad_library_versions(ad_id,content_hash,content,captured_at) values
 ('a0000000-0000-4000-8000-000000000001',repeat('a',64),'{"landing_url":"https://www.brand.com/p","cards":[{"landing_url":"https://brand.net/a"},{"landing_url":"https://brand.net/b"}]}','2026-10-01');
insert into ad_library_saves(company_id,user_id,ad_id) values
 ('network-a','00000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000002');
do $$ declare
 a uuid := '10000000-0000-4000-8000-000000000001'; b uuid := '20000000-0000-4000-8000-000000000002';
 outsider uuid := '30000000-0000-4000-8000-000000000003'; u uuid := '00000000-0000-4000-8000-000000000001';
 net jsonb; stats jsonb; page jsonb; cursor_value numeric; cursor_id uuid;
begin
 net := public.ad_library_brand_network('network-a');
 assert jsonb_array_length(net->'edges')=3;
 assert not exists(select 1 from jsonb_array_elements(net->'edges') e where e->>'brandId'=outsider::text);
 assert (select (e->>'adCount')::integer=1 from jsonb_array_elements(net->'edges') e where e->>'domain'='brand.net');
 assert (select first_observed_at='2026-10-01' and last_observed_at='2026-10-02' from ad_library_page_domains where brand_id=a and domain='brand.com');
 update ad_library_ads set last_seen='2026-10-03' where brand_id=a;
 assert (select last_observed_at='2026-10-03' from ad_library_page_domains where brand_id=a and domain='brand.net');
 stats := public.ad_library_workspace_scope_insights('network-a',u,p_brands=>array[a,b,outsider]);
 assert stats->>'total'='2'; assert jsonb_array_length(stats->'fanpages')=2;
 assert jsonb_array_length(stats->'destinations'->0->'fanpages')=2;
 assert jsonb_array_length(public.ad_library_workspace_scope_page('network-a',u,p_brands=>array[outsider]))=0;
 assert jsonb_array_length(public.ad_library_workspace_scope_page('network-a',u,p_brands=>array[a,b],p_saved=>true))=1;
 assert jsonb_array_length(public.ad_library_workspace_scope_page('network-a',u,p_brands=>array[a,b],p_format=>'image'))=1;
 assert jsonb_array_length(public.ad_library_workspace_scope_page('network-a',u,p_brands=>array[a,b],p_group_type=>'domain',p_group_value=>'brand.net'))=1;
 page := public.ad_library_workspace_scope_page('network-a',u,p_brands=>array[a,b],p_limit=>1);
 cursor_value := (page->0->>'sort_value')::numeric; cursor_id := (page->0->>'id')::uuid;
 page := public.ad_library_workspace_scope_page('network-a',u,p_brands=>array[a,b],p_after=>cursor_value,p_after_id=>cursor_id);
 assert jsonb_array_length(page)=1 and page->0->>'id'<>cursor_id::text;
 -- Changed destinations retain positive evidence without manufacturing absence.
 update ad_library_ads set landing_url='https://new-domain.example/',content_hash=repeat('d',64),last_seen='2026-10-04' where brand_id=a;
 assert (select count(*)=3 from ad_library_page_domains where brand_id=a);
 assert (select last_observed_at='2026-10-03' from ad_library_page_domains where brand_id=a and domain='brand.com');
 assert (select first_seen='2026-10-01' and missing_complete_scans=0 from ad_library_ads where brand_id=a);
 assert (select last_complete_scan_at is null from ad_library_brands where id=a);
 update ad_library_follows set active=false where company_id='network-a' and brand_id=b;
 assert not exists(select 1 from jsonb_array_elements(public.ad_library_brand_network('network-a')->'edges') e where e->>'brandId'=b::text);
end $$;
-- A verified profile link is evidence even with zero ads. An input URL alone is not.
insert into ad_library_brand_requests(id,company_id,created_by,input_url,url_hash,candidates,status) values
 ('40000000-0000-4000-8000-000000000004','network-a','00000000-0000-4000-8000-000000000001','https://guessed.example/',repeat('9',64),
  '[{"pageId":"23456","name":"Same name","websites":["https://profile-published.example/","https://localhost"]}]','needs_selection');
select public.ad_library_complete_brand_request('40000000-0000-4000-8000-000000000004','network-a','23456','meta_web');
do $$ begin
 assert (select count(*)=1 from ad_library_page_domains where kind='fanpage_website' and domain='profile-published.example');
 assert not exists(select 1 from ad_library_page_domains where domain in ('guessed.example','localhost'));
end $$;
reset role;
select 'PASS: domain evidence, version history, carousel, profile link, company isolation, RLS, grouping filters, saves, pagination and no destructive merge';
