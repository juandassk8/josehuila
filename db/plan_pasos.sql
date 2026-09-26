-- =====================================================================
-- db/plan_pasos.sql — estado del Plan de implementación (vista cliente)
--
-- Única tabla que el portal ESCRIBE para el Plan. El contenido (fases,
-- accionables, textos) vive en el JSON read-only de plan.josehuila.com;
-- acá guardamos SOLO estado por paso. Clave estable (cliente, paso_id):
-- si Inforce corrige la redacción de un accionable o el plan crece de 16 a
-- 18 pasos, lo marcado NO se pierde (los ids son estables). Un paso_id que
-- ya no exista en el JSON se ignora en silencio (huérfano) — no rompe nada.
--
-- Correr en el SQL Editor de Supabase. Idempotente.
--
-- RLS: mismo patrón permisivo que el resto del workspace HOY
-- (ver db/despliegue_creativo.sql). Cuando se aplique el blindaje
-- multi-tenant (db/rls_hardening_v1.sql, tras migrar clientes a Supabase
-- Auth) esta tabla debe entrar en ese pase.
-- =====================================================================

CREATE TABLE IF NOT EXISTS plan_pasos (
  cliente        TEXT NOT NULL,               -- slug del plan (= companies.slug)
  paso_id        TEXT NOT NULL,               -- id estable del paso dentro del plan
  completado     BOOLEAN NOT NULL DEFAULT FALSE,
  completado_en  TIMESTAMPTZ,                 -- se escribe al marcar, se limpia al desmarcar
  agendado_para  DATE,                        -- fecha de la tarea creada desde el accionable
  asignado_a     UUID,                        -- miembro asignado (sin FK: puede ser team o client user)
  tarea_id       UUID,                        -- tarea creada desde el accionable
  PRIMARY KEY (cliente, paso_id)
);

ALTER TABLE plan_pasos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS auth_all_plan_pasos ON plan_pasos;
DROP POLICY IF EXISTS anon_all_plan_pasos ON plan_pasos;

CREATE POLICY auth_all_plan_pasos ON plan_pasos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY anon_all_plan_pasos ON plan_pasos FOR ALL TO anon          USING (true) WITH CHECK (true);
