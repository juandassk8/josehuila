-- Despliegue Creativo — v3: columna config JSONB para cadencia y distribución.
-- Idempotente.

ALTER TABLE despliegue_boards
  ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}'::jsonb;

-- El shape esperado del JSON config:
-- {
--   "weekly_spend":          número  — inversión semanal en ads ($)
--   "aov":                   número  — ticket promedio ($)
--   "kill_rule_multiplier":  número  — default 3 (3× AOV = kill rule)
--   "distribution": {
--     "tofu": 60,
--     "mofu": 30,
--     "bofu": 10
--   }
-- }
--
-- Fórmula (calculada en frontend):
--   creativos_min_semana = weekly_spend / (aov * kill_rule_multiplier)
--   creativos_tofu = creativos_min_semana * tofu / 100
--   (análogo para mofu, bofu)
