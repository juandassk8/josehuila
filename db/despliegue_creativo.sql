-- Módulo de Despliegue Creativo
-- Tablero visual de gestión de creativos Meta Ads por cliente.
-- Correr en Supabase: Dashboard → SQL Editor → pegar y ejecutar.
-- Idempotente: seguro de correr múltiples veces.

-- ────────────────────────────────────────────────────────────────────────
-- TABLAS
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS despliegue_boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Una sola board activa por empresa (si se desactiva la vieja, se puede crear nueva).
CREATE UNIQUE INDEX IF NOT EXISTS idx_despliegue_boards_company_active
  ON despliegue_boards (company_id) WHERE active = true;

CREATE TABLE IF NOT EXISTS despliegue_concepts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES despliegue_boards(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN ('tofu', 'mofu', 'bofu')),
  format TEXT NOT NULL CHECK (format IN ('static', 'video')),
  name TEXT NOT NULL,
  weekly_target INT NOT NULL DEFAULT 3,
  order_index INT DEFAULT 0,
  archived BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_despliegue_concepts_board
  ON despliegue_concepts (board_id, stage, format, order_index)
  WHERE archived = false;

CREATE TABLE IF NOT EXISTS despliegue_variations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id UUID NOT NULL REFERENCES despliegue_concepts(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  name TEXT,
  state TEXT NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending', 'produced', 'testing', 'winner', 'paused')),
  file_url TEXT,
  drive_url TEXT,
  meta_ads_library_url TEXT,
  meta_ad_id TEXT,
  notes TEXT,
  produced_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_despliegue_variations_concept
  ON despliegue_variations (concept_id);
CREATE INDEX IF NOT EXISTS idx_despliegue_variations_produced_at
  ON despliegue_variations (produced_at);

-- ────────────────────────────────────────────────────────────────────────
-- RLS — políticas permisivas (como companies/reports). Se tightenan después.
-- ────────────────────────────────────────────────────────────────────────

ALTER TABLE despliegue_boards     ENABLE ROW LEVEL SECURITY;
ALTER TABLE despliegue_concepts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE despliegue_variations ENABLE ROW LEVEL SECURITY;

-- Authenticated (team via Supabase Auth).
DROP POLICY IF EXISTS auth_all_despliegue_boards     ON despliegue_boards;
DROP POLICY IF EXISTS auth_all_despliegue_concepts   ON despliegue_concepts;
DROP POLICY IF EXISTS auth_all_despliegue_variations ON despliegue_variations;

CREATE POLICY auth_all_despliegue_boards     ON despliegue_boards     FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_all_despliegue_concepts   ON despliegue_concepts   FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_all_despliegue_variations ON despliegue_variations FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Anon (clientes entran con PIN, sin sesión Supabase). Igual que companies/reports.
DROP POLICY IF EXISTS anon_all_despliegue_boards     ON despliegue_boards;
DROP POLICY IF EXISTS anon_all_despliegue_concepts   ON despliegue_concepts;
DROP POLICY IF EXISTS anon_all_despliegue_variations ON despliegue_variations;

CREATE POLICY anon_all_despliegue_boards     ON despliegue_boards     FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_all_despliegue_concepts   ON despliegue_concepts   FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_all_despliegue_variations ON despliegue_variations FOR ALL TO anon USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────────────────
-- REALTIME (opcional: para que cuando cliente suba, admin vea al instante)
-- ────────────────────────────────────────────────────────────────────────

-- Agregar a la publicación de realtime. Si ya existen, no pasa nada.
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE despliegue_boards;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE despliegue_concepts;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE despliegue_variations;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
