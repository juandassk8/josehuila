-- Fija search_path = public, pg_temp en las funciones propias del esquema public (ya aplicado 2026-09-19). Idempotente.
do $$ declare r record; begin
  for r in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop execute format('alter function %s set search_path = public, pg_temp', r.sig); end loop;
end $$;
