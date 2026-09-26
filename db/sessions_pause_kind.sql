-- Tipo de pausa: descanso (planeado) o inconveniente (algo me sacó). Solo agrega una columna. Idempotente.
alter table public.time_tracker_sessions add column if not exists pause_kind text;
do $$ begin
  alter table public.time_tracker_sessions
    add constraint time_tracker_sessions_pause_kind_valid
    check (pause_kind is null or pause_kind in ('descanso', 'inconveniente'));
exception when duplicate_object then null; end $$;
notify pgrst, 'reload schema';
