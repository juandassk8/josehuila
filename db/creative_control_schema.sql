-- Control de Creativos — hoja estilo Google Sheets por empresa.
-- Cada empresa tiene N "Entregas" (tabs en el footer). Cada Entrega es una
-- hoja con N filas (creative_items). Las columnas tipo dropdown tienen sus
-- opciones (valor + color) configuradas por empresa en creative_column_options.
--
-- Modelo independiente del Kanban Despliegue — no hay sync bidireccional.
--
-- Correr en Supabase Dashboard → SQL Editor. Idempotente.

-- ────────────────────────────────────────────────────────────────────────
-- creative_deliveries — tabs del footer (Entrega #1, #2, ...)
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS creative_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL,
  delivery_number INT NOT NULL,
  name TEXT,                           -- override del label; si null se compone "Entrega #N"
  notes TEXT,                          -- nota libre opcional (no se usa en v1)
  archived BOOLEAN NOT NULL DEFAULT false,
  tab_order INT NOT NULL DEFAULT 0,    -- orden de los tabs en el footer
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, delivery_number)
);

CREATE INDEX IF NOT EXISTS idx_creative_deliveries_company
  ON creative_deliveries(company_id, archived, tab_order);

-- ────────────────────────────────────────────────────────────────────────
-- creative_items — filas dentro de una entrega
-- Las columnas son flexibles: las tipadas tienen su propio campo, y `extras`
-- permite columnas custom futuras sin migración.
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS creative_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES creative_deliveries(id) ON DELETE CASCADE,
  row_order INT NOT NULL DEFAULT 0,

  -- Columnas v1 (todas opcionales — el user llena lo que necesita)
  creative_number TEXT,                -- "#006"
  format TEXT,                         -- "Video" / "Estático" (dropdown)
  hook TEXT,                           -- "#1" .. "#5" (dropdown)
  product TEXT,                        -- dropdown user-managed
  tipo TEXT,                           -- "UGC" / "IA" / "Pixar" / ... (dropdown)
  editor TEXT,                         -- dropdown user-managed
  due_date DATE,
  script_url TEXT,
  draft_url TEXT,
  creatives_url TEXT,
  ad_status TEXT,                      -- "Publicado" / "Pausado" / ... (dropdown)
  calidad TEXT,                        -- "A+" / "A" / "B" / "C" (dropdown)

  extras JSONB NOT NULL DEFAULT '{}',  -- columnas custom futuras
  -- task_id: si la fila tiene editor+due_date, auto-creamos una tarea en
  -- company_tasks y guardamos su id acá para poder updatearla/borrarla
  -- cuando el user cambie el editor o la fecha.
  task_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migración no-destructiva para installs que ya tenían creative_items.
ALTER TABLE creative_items ADD COLUMN IF NOT EXISTS task_id UUID;

CREATE INDEX IF NOT EXISTS idx_creative_items_delivery
  ON creative_items(delivery_id, row_order);

-- ────────────────────────────────────────────────────────────────────────
-- creative_column_options — opciones de dropdown user-managed por empresa.
-- Una fila por (company, columna, valor). El color es el chip de fondo.
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS creative_column_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL,
  column_key TEXT NOT NULL,            -- "format" | "hook" | "product" | "tipo" | "editor" | "ad_status" | "calidad"
  value TEXT NOT NULL,                 -- el valor que se guarda en creative_items
  color TEXT NOT NULL DEFAULT '#E8EAED', -- HEX del chip
  position INT NOT NULL DEFAULT 0,     -- orden en el dropdown
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, column_key, value)
);

CREATE INDEX IF NOT EXISTS idx_creative_column_options_company
  ON creative_column_options(company_id, column_key, position);

-- ────────────────────────────────────────────────────────────────────────
-- Trigger: actualizar updated_at en updates
-- ────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at_creative() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_creative_deliveries_updated ON creative_deliveries;
CREATE TRIGGER trg_creative_deliveries_updated
  BEFORE UPDATE ON creative_deliveries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_creative();

DROP TRIGGER IF EXISTS trg_creative_items_updated ON creative_items;
CREATE TRIGGER trg_creative_items_updated
  BEFORE UPDATE ON creative_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_creative();

-- ────────────────────────────────────────────────────────────────────────
-- RLS — siguiendo el patrón del resto del schema (permisivo, auth en app)
-- ────────────────────────────────────────────────────────────────────────

ALTER TABLE creative_deliveries     ENABLE ROW LEVEL SECURITY;
ALTER TABLE creative_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE creative_column_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS auth_all_creative_deliveries     ON creative_deliveries;
DROP POLICY IF EXISTS auth_all_creative_items          ON creative_items;
DROP POLICY IF EXISTS auth_all_creative_column_options ON creative_column_options;
DROP POLICY IF EXISTS anon_all_creative_deliveries     ON creative_deliveries;
DROP POLICY IF EXISTS anon_all_creative_items          ON creative_items;
DROP POLICY IF EXISTS anon_all_creative_column_options ON creative_column_options;

CREATE POLICY auth_all_creative_deliveries     ON creative_deliveries     FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_all_creative_items          ON creative_items          FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_all_creative_column_options ON creative_column_options FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY anon_all_creative_deliveries     ON creative_deliveries     FOR ALL TO anon          USING (true) WITH CHECK (true);
CREATE POLICY anon_all_creative_items          ON creative_items          FOR ALL TO anon          USING (true) WITH CHECK (true);
CREATE POLICY anon_all_creative_column_options ON creative_column_options FOR ALL TO anon          USING (true) WITH CHECK (true);
