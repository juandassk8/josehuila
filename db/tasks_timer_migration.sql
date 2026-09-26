-- =========================================================
-- INFORCE CENTRAL — Timer para tareas
-- Añade columnas para registrar tiempo acumulado y sesión actual.
-- SAFE: idempotente.
-- =========================================================

alter table public.tasks
  add column if not exists time_spent_seconds int not null default 0;

alter table public.tasks
  add column if not exists timer_started_at timestamptz;

-- No agregamos indexes: los timers se consultan junto con la tarea misma.
