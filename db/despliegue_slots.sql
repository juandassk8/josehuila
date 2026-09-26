-- Content Pipeline del Cliente — Fase 1
-- Tabla de slots: creativos en producción semanal.
-- Separada de despliegue_variations (que sigue siendo thumbnails de inspiración
-- en el canvas estratégico).
--
-- Correr en Supabase: Dashboard → SQL Editor → pegar y ejecutar.
-- Idempotente.

-- ────────────────────────────────────────────────────────────────────────
-- SLOTS
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS despliegue_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES despliegue_boards(id) ON DELETE CASCADE,
  weekly_plan_id UUID,                    -- FK a weekly_plans (Fase 2). Null si creado ad-hoc.
  concept_id UUID REFERENCES despliegue_concepts(id) ON DELETE SET NULL,

  -- Clasificación (Tipo / Formato del pipeline)
  stage TEXT NOT NULL CHECK (stage IN ('tofu', 'mofu', 'bofu')),
  format TEXT NOT NULL CHECK (format IN ('static', 'video')),
  concept_name TEXT,                      -- snapshot del nombre del concepto (para no depender de concept_id)
  angle TEXT,                             -- ángulo específico (free text o dropdown)

  -- Contenido básico
  title TEXT,
  reference_url TEXT,                     -- URL de referencia (IG/TikTok reel)
  reference_transcript TEXT,              -- transcripción del reel (Fase 4)

  -- Pipeline state
  status TEXT NOT NULL DEFAULT 'idea'
    CHECK (status IN ('idea', 'scripting', 'to_film', 'to_edit', 'in_campaign', 'feedback')),
  review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'requested', 'approved', 'changes_requested')),
  column_order INT DEFAULT 0,

  -- Scripting (Fase 4)
  script_hooks JSONB,                     -- [{ text, selected }]
  script_body TEXT,
  script_cta TEXT,
  script_notes TEXT,
  script_generated_at TIMESTAMPTZ,

  -- Producción (links a Drive)
  raw_content_url TEXT,                   -- carpeta contenido en crudo
  edited_content_url TEXT,                -- carpeta video editado
  video_url TEXT,                         -- link al video/estático final
  ad_name TEXT,                           -- nombre del anuncio
  editor_id TEXT,                         -- persona asignada
  edition_date DATE,
  publication_date DATE,

  -- Revisión (Fase 5)
  loom_review_url TEXT,
  loom_review_timestamp TEXT,             -- ej "3:42"
  review_rating INT CHECK (review_rating IS NULL OR (review_rating >= 0 AND review_rating <= 10)),
  review_notes TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,

  -- Feedback / Performance (Fase 6)
  performance TEXT CHECK (performance IS NULL OR performance IN ('green', 'yellow', 'red')),
  performance_notes TEXT,
  performance_marked_at TIMESTAMPTZ,
  in_campaign_at TIMESTAMPTZ,             -- cuándo entró a "in_campaign" (para el cron de 3 días)

  -- Metadata
  week_iso TEXT,                          -- "2026-W17"
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_despliegue_slots_board_status
  ON despliegue_slots (board_id, status, column_order);

CREATE INDEX IF NOT EXISTS idx_despliegue_slots_board_week
  ON despliegue_slots (board_id, week_iso);

CREATE INDEX IF NOT EXISTS idx_despliegue_slots_review_status
  ON despliegue_slots (board_id, review_status)
  WHERE review_status = 'requested';

-- ────────────────────────────────────────────────────────────────────────
-- WEEKLY PLANS (Fase 2 — preparamos la tabla, la UI viene después)
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS despliegue_weekly_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES despliegue_boards(id) ON DELETE CASCADE,
  week_iso TEXT NOT NULL,                 -- "2026-W17"
  spend NUMERIC,
  aov NUMERIC,
  kill_rule_multiplier NUMERIC DEFAULT 3,
  distribution JSONB,                     -- {tofu:60, mofu:30, bofu:10}
  active_concepts JSONB,                  -- [{concept_id, slots_count}]
  total_slots INT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (board_id, week_iso)
);

CREATE INDEX IF NOT EXISTS idx_despliegue_weekly_plans_board_week
  ON despliegue_weekly_plans (board_id, week_iso);

-- ────────────────────────────────────────────────────────────────────────
-- RLS (consistente con el resto del módulo)
-- ────────────────────────────────────────────────────────────────────────

ALTER TABLE despliegue_slots         ENABLE ROW LEVEL SECURITY;
ALTER TABLE despliegue_weekly_plans  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS auth_all_despliegue_slots        ON despliegue_slots;
DROP POLICY IF EXISTS auth_all_despliegue_weekly_plans ON despliegue_weekly_plans;
DROP POLICY IF EXISTS anon_all_despliegue_slots        ON despliegue_slots;
DROP POLICY IF EXISTS anon_all_despliegue_weekly_plans ON despliegue_weekly_plans;

CREATE POLICY auth_all_despliegue_slots        ON despliegue_slots        FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_all_despliegue_weekly_plans ON despliegue_weekly_plans FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY anon_all_despliegue_slots        ON despliegue_slots        FOR ALL TO anon          USING (true) WITH CHECK (true);
CREATE POLICY anon_all_despliegue_weekly_plans ON despliegue_weekly_plans FOR ALL TO anon          USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────────────────
-- REALTIME
-- ────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE despliegue_slots;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE despliegue_weekly_plans;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- ────────────────────────────────────────────────────────────────────────
-- TRIGGERS — mantener updated_at
-- ────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_despliegue_slots_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_despliegue_slots_updated_at ON despliegue_slots;
CREATE TRIGGER trg_despliegue_slots_updated_at
  BEFORE UPDATE ON despliegue_slots
  FOR EACH ROW
  EXECUTE FUNCTION update_despliegue_slots_updated_at();
