-- Distingue referentes (ejemplos de inspiración) de anuncios producidos por
-- la empresa. Los referentes llegan desde el modal "Nueva referencia". Los
-- producidos llegan cuando un slot del pipeline entra a in_campaign.
ALTER TABLE despliegue_variations
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'reference'
    CHECK (source_type IN ('reference', 'produced'));

-- Backfill: las variations con source_slot_id son producidas por la empresa.
UPDATE despliegue_variations
  SET source_type = 'produced'
  WHERE source_slot_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_despliegue_variations_source_type
  ON despliegue_variations (source_type);
