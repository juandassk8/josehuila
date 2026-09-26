-- =====================================================================
-- db/plan_subtareas.sql — estado de las SUBTAREAS de cada accionable del
-- Plan de implementación. El contenido (el array subtareas[] de cada paso)
-- vive en el JSON read-only de plan.josehuila.com; acá guardamos SOLO el
-- estado (hecho/pendiente) por subtarea, con clave estable
-- (cliente, paso_id, sub_indice). Un índice que ya no exista en el JSON se
-- ignora en silencio (huérfano). Paralelo a plan_pasos.
--
-- Correr en el SQL Editor de Supabase. Idempotente.
-- RLS: authenticated-only (post-Fase 0; los clientes entran con JWT). Sin anon.
-- =====================================================================

CREATE TABLE IF NOT EXISTS plan_subtareas (
  cliente        TEXT NOT NULL,               -- slug del plan (= plan_pasos.cliente)
  paso_id        TEXT NOT NULL,               -- id del accionable padre
  sub_indice     INT  NOT NULL,               -- índice de la subtarea en subtareas[]
  completado     BOOLEAN NOT NULL DEFAULT FALSE,
  completado_en  TIMESTAMPTZ,                 -- se escribe al marcar, se limpia al desmarcar
  PRIMARY KEY (cliente, paso_id, sub_indice)
);

ALTER TABLE plan_subtareas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_all_plan_subtareas ON plan_subtareas;
DROP POLICY IF EXISTS anon_all_plan_subtareas ON plan_subtareas;
CREATE POLICY auth_all_plan_subtareas ON plan_subtareas FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
