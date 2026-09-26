-- Fase 3.1: historial de revisiones por stage.
--
-- loom_review_url ya se usa como brief del UGC/editor (lo graba la empresa
-- explicando el video). NO lo tocamos. Agregamos un campo nuevo `review_feedback`
-- que guarda cada revisión como un entry {stage, decision, loom_url, at}.
-- Un slot puede acumular: feedback de scripting, feedback de to_film, etc.
--
-- Idempotente.

alter table public.despliegue_slots
  add column if not exists review_feedback jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';
