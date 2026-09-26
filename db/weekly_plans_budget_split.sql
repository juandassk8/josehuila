-- Agrega budget_split a despliegue_weekly_plans.
-- Guarda el reparto del presupuesto semanal entre escalar ganadores y testing
-- nuevo, para que la cadencia semanal pueda calcular creativos en base al
-- budget de testing solamente (no al total semanal).
--
-- Idempotente.

alter table public.despliegue_weekly_plans
  add column if not exists budget_split jsonb default '{"scale": 70, "testing": 30}'::jsonb;
