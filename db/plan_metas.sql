-- =====================================================================
-- db/plan_metas.sql — checkpoints SEMANALES de las metas del Plan.
-- Las metas no son tareas que se completan: son ritmos que se sostienen.
-- Grilla filas=metas × columnas=semanas (12 = un trimestre). Cada celda:
--   valor = 1 (cumplido), 0 (no cumplido), o SIN FILA (sin marcar).
-- El contenido (metas[] con su texto/detalle/cadencia) vive en el JSON
-- read-only; acá guardamos SOLO el estado por (meta_orden, semana).
--
-- Correr en el SQL Editor de Supabase. Idempotente.
-- RLS: authenticated-only (post-Fase 0). Sin anon.
-- =====================================================================

CREATE TABLE IF NOT EXISTS plan_metas (
  cliente     TEXT NOT NULL,   -- slug del plan
  meta_orden  INT  NOT NULL,   -- orden de la meta dentro de metas[]
  semana      INT  NOT NULL,   -- 1..12 (trimestre)
  valor       INT  NOT NULL,   -- 1 cumplido | 0 no cumplido (sin marcar = sin fila)
  updated_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (cliente, meta_orden, semana),
  CHECK (valor IN (0, 1))
);

ALTER TABLE plan_metas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_all_plan_metas ON plan_metas;
DROP POLICY IF EXISTS anon_all_plan_metas ON plan_metas;
CREATE POLICY auth_all_plan_metas ON plan_metas FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
