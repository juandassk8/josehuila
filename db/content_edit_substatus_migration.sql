-- =========================================================
-- INFORCE CENTRAL — Edit sub-status (Fase C)
-- Sub-estado dentro de to_edit: en_proceso / en_revision / aprobado.
-- Aditiva: solo crea tipo nuevo y columna; trigger limpia al salir de to_edit.
-- Run desde Supabase SQL Editor.
-- =========================================================

-- 1. Enum del sub-estado
do $$ begin
  create type edit_substatus as enum ('en_proceso','en_revision','aprobado');
exception when duplicate_object then null; end $$;

-- 2. Columna en content_items
alter table public.content_items
  add column if not exists edit_substatus edit_substatus;

-- 3. Trigger: si status deja de ser 'to_edit', limpia el sub-estado.
create or replace function public.clear_edit_substatus()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from 'to_edit' then
    new.edit_substatus := null;
  end if;
  return new;
end $$;

drop trigger if exists content_clear_substatus on public.content_items;
create trigger content_clear_substatus
  before update of status on public.content_items
  for each row execute function public.clear_edit_substatus();

-- 4. Verificación (opcional)
-- select id, title, status, edit_substatus from public.content_items limit 5;
