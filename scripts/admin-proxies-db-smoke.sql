-- EMPTY isolated database only, after admin-operations-db-smoke.sql and proxy migration.
\set ON_ERROR_STOP on
reset role;
set role service_role;
do $$ declare
  envelope text:='v1.'||repeat('a',16)||'.'||repeat('b',22)||'.'||repeat('c',100);
  routes jsonb:='[{"slot":"primary","server":"socks5://8.8.8.8:1080","hasCredentials":true}]';
  result jsonb;
begin
  result:=public.admin_save_proxy_settings('00000000-0000-0000-0000-000000000001',0,envelope,routes);
  assert result->>'revision'='1';
  assert not result ? 'encrypted_value';
  assert (select encrypted_value from public.admin_proxy_settings)=envelope;
  assert not exists(select 1 from public.admin_operations_audit where action='proxies_saved'
    and (after_value::text like '%v1.%' or after_value::text like '%password%'));
  begin
    perform public.admin_save_proxy_settings('00000000-0000-0000-0000-000000000001',0,envelope,routes);
    raise exception 'stale revision accepted';
  exception when serialization_failure then null; end;
  begin
    perform public.admin_save_proxy_settings('00000000-0000-0000-0000-000000000002',1,envelope,routes);
    raise exception 'editor accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.admin_save_proxy_settings('00000000-0000-0000-0000-000000000003',1,envelope,routes);
    raise exception 'disabled admin accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.admin_save_proxy_settings('00000000-0000-0000-0000-000000000001',1,'plaintext-secret',routes);
    raise exception 'plaintext accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.admin_save_proxy_settings('00000000-0000-0000-0000-000000000001',1,envelope,
      '[{"slot":"primary","server":"socks5://8.8.8.8:1080","hasCredentials":true,"password":"leak"}]');
    raise exception 'secret metadata accepted';
  exception when invalid_parameter_value then null; end;
  assert (select revision from public.admin_proxy_settings)=1;
  assert (select count(*) from public.admin_operations_audit where action='proxies_saved')=1;
end $$;
reset role;
set role authenticated;
do $$ begin
  begin perform encrypted_value from public.admin_proxy_settings;raise exception 'customer read allowed';exception when insufficient_privilege then null;end;
  begin perform public.admin_save_proxy_settings('00000000-0000-0000-0000-000000000001',1,'bad','[]');raise exception 'customer save allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
set role anon;
do $$ begin
  begin perform encrypted_value from public.admin_proxy_settings;raise exception 'anonymous read allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'Proxy constraints, permissions, revisions and secret-free audit passed' as result;
