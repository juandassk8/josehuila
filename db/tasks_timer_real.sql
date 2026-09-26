-- Fase 1 — Timer real por tarea.
-- Solo AGREGA columnas (no borra ni modifica datos existentes). Idempotente.
--
-- tasks.estimate_minutes  → cuánto creo que me va a tomar la tarea.
-- tasks.work_type         → 'profundo' (trabajo pesado) | 'liviano'.
-- time_tracker_sessions.end_kind     → cómo terminó la sesión:
--     'pausa' (la dejé a medias) | 'terminada' (completé la tarea) | 'cambio' (salté a otra).
-- time_tracker_sessions.pause_reason → nota rápida de por qué pausé.

alter table public.tasks
  add column if not exists estimate_minutes int,
  add column if not exists work_type text;

do $$ begin
  alter table public.tasks
    add constraint tasks_estimate_minutes_range
    check (estimate_minutes is null or (estimate_minutes between 1 and 6000));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.tasks
    add constraint tasks_work_type_valid
    check (work_type is null or work_type in ('profundo', 'liviano'));
exception when duplicate_object then null; end $$;

alter table public.time_tracker_sessions
  add column if not exists end_kind text,
  add column if not exists pause_reason text;

do $$ begin
  alter table public.time_tracker_sessions
    add constraint time_tracker_sessions_end_kind_valid
    check (end_kind is null or end_kind in ('pausa', 'terminada', 'cambio'));
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';
