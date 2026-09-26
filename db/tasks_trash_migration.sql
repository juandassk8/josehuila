-- Papelera para tareas: soft delete con auto-limpieza a 30 días.
alter table public.tasks
  add column if not exists deleted_at timestamptz;

create index if not exists tasks_deleted_at_idx
  on public.tasks(deleted_at) where deleted_at is not null;
