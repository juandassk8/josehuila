-- Synthetic data only. Execute in an EMPTY, isolated test cluster after migrations.
\set ON_ERROR_STOP on
insert into public.team_members(id,name,role,active) values
 ('00000000-0000-0000-0000-000000000001','Admin de prueba','admin',true),
 ('00000000-0000-0000-0000-000000000002','Editor de prueba','editor',true),
 ('00000000-0000-0000-0000-000000000003','Admin inactivo','admin',false);
insert into public.companies(id) values('test-company'),('test-company-2');
insert into public.ad_library_brands(id,meta_page_id,name) values
 ('00000000-0000-0000-0000-000000000011','123456','Marca de prueba');
insert into public.ad_library_follows(company_id,brand_id) values
 ('test-company','00000000-0000-0000-0000-000000000011'),('test-company-2','00000000-0000-0000-0000-000000000011');
insert into public.ad_library_ads(brand_id,source_ad_id,source_url,content_hash) values
 ('00000000-0000-0000-0000-000000000011','test-ad','https://example.invalid',repeat('a',64));
insert into public.ad_library_crawl_runs(brand_id,status,error_code) values
 ('00000000-0000-0000-0000-000000000011','failed','META_RATE_LIMITED');

set role service_role;
do $$ declare result jsonb; begin
  result := public.admin_operations_summary();
  assert result->>'ads' = '1', 'global ads must not be duplicated by follows';
  assert result->>'followed_brands' = '1';
  assert result->>'failed_24h' = '1';
  result := public.admin_operations_brands('prueba',true,0);
  assert result->>'total' = '1'; assert result#>>'{rows,0,followers}' = '2';
  assert jsonb_array_length(public.admin_operations_brands('missing',false,0)->'rows') = 0;
  result := public.admin_operations_runs('failed',null,0);
  assert result->>'total' = '1'; assert result#>>'{rows,0,error_code}' = 'META_RATE_LIMITED';
  assert not (result#>'{rows,0}') ? 'error_message', 'do not expose raw errors';
end $$;

select public.admin_save_collection_settings('00000000-0000-0000-0000-000000000001',1,
 '{"enabled":false,"changes_hours":3,"quiet_hours":12,"error_hours":2,"scrapling_enabled":false}');
do $$ declare settings jsonb := '{"enabled":true,"changes_hours":6,"quiet_hours":24,"error_hours":6,"scrapling_enabled":true}'; begin
  assert (select revision from public.admin_collection_settings) = 2;
  assert (select count(*) from public.admin_operations_audit) = 1;
  assert (select before_value->>'enabled' from public.admin_operations_audit) = 'true';
  assert (select after_value->>'enabled' from public.admin_operations_audit) = 'false';
  begin
    perform public.admin_save_collection_settings('00000000-0000-0000-0000-000000000001',1,settings);
    raise exception 'stale revision was accepted';
  exception when serialization_failure then null; end;
  begin
    perform public.admin_save_collection_settings('00000000-0000-0000-0000-000000000002',2,settings);
    raise exception 'editor accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.admin_save_collection_settings('00000000-0000-0000-0000-000000000003',2,settings);
    raise exception 'inactive admin accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.admin_save_collection_settings('00000000-0000-0000-0000-000000000001',2,settings || '{"quiet_hours":1}');
    raise exception 'invalid cadence accepted';
  exception when check_violation then null; end;
  assert (select revision from public.admin_collection_settings) = 2, 'failed changes must roll back';
  assert (select count(*) from public.admin_operations_audit) = 1, 'failed changes must not create audit entries';
end $$;
reset role;

do $$ declare r text; begin
  foreach r in array array['anon','authenticated'] loop
    assert not has_table_privilege(r,'public.admin_collection_settings','SELECT');
    assert not has_table_privilege(r,'public.admin_operations_audit','INSERT');
    assert not has_function_privilege(r,'public.admin_operations_summary()','EXECUTE');
    assert not has_function_privilege(r,'public.admin_save_collection_settings(uuid,integer,jsonb)','EXECUTE');
  end loop;
end $$;

insert into public.ad_library_brands(meta_page_id,name) select (200000+n)::text,'Otra marca '||n from generate_series(1,30) n;
do $$ begin
  assert (public.admin_operations_brands('',false,0)->>'total')::int = 31;
  assert jsonb_array_length(public.admin_operations_brands('',false,0)->'rows') = 25;
  assert jsonb_array_length(public.admin_operations_brands('',false,25)->'rows') = 6;
end $$;
select 'ADMIN_DATABASE_SMOKE_OK' as result;
