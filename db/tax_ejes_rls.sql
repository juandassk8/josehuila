-- Cierra 3 tablas de taxonomía que estaban SIN RLS (ya aplicado en producción 2026-09-19). Idempotente.
do $$ declare t text; begin
  foreach t in array array['tax_hooks','tax_momentos','tax_conciencia'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_read', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
