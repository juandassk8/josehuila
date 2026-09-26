-- =========================================================
-- INFORCE CENTRAL — Modos del timer (cronómetro vs temporizador)
-- SAFE: idempotente.
-- =========================================================

alter table public.tasks
  add column if not exists timer_mode text check (timer_mode in ('cronometro','temporizador'));

alter table public.tasks
  add column if not exists timer_duration_seconds int;
