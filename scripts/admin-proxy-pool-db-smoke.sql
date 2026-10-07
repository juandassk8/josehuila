-- EMPTY isolated database only, after both admin migrations and existing smoke scripts.
\set ON_ERROR_STOP on
set role service_role;
do $$ declare
  envelope text:='v1.'||repeat('a',16)||'.'||repeat('b',22)||'.'||repeat('c',12000);
  routes jsonb;
  revision_before integer;
begin
  select jsonb_agg(jsonb_build_object('slot',case i when 0 then 'primary' else 'proxy-00000000-0000-0000-0000-'||lpad(i::text,12,'0') end,
    'server','http://8.8.8.'||(i+1)||':8000','hasCredentials',true) order by i) into routes from generate_series(0,9) i;
  perform public.admin_save_proxy_settings('00000000-0000-0000-0000-000000000001',1,envelope,routes);
  assert (select jsonb_array_length(p.routes) from public.admin_proxy_settings p)=10;
  -- Removing a middle route retains the remaining stable identifiers.
  perform public.admin_save_proxy_settings('00000000-0000-0000-0000-000000000001',2,envelope,routes-1);
  assert (select p.routes->1->>'slot' from public.admin_proxy_settings p)='proxy-00000000-0000-0000-0000-000000000002';
  select revision into revision_before from public.admin_proxy_settings;
  begin
    perform public.admin_save_proxy_settings('00000000-0000-0000-0000-000000000001',revision_before,envelope,routes||jsonb_build_array(routes->1));
    raise exception 'eleven routes accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.admin_save_proxy_settings('00000000-0000-0000-0000-000000000001',revision_before,envelope,jsonb_build_array(routes->0,routes->1,routes->1));
    raise exception 'duplicate identities accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.admin_save_proxy_settings('00000000-0000-0000-0000-000000000001',revision_before,envelope,jsonb_set(routes,'{2,slot}','"bad"'));
    raise exception 'invalid identity accepted';
  exception when invalid_parameter_value then null; end;
  assert (select revision from public.admin_proxy_settings)=revision_before;
  assert not exists(select 1 from public.admin_operations_audit where action='proxies_saved' and after_value::text like '%v1.%');
end $$;
reset role;
select 'Ten routes, stable identities, limits and atomic audit verified' as result;
