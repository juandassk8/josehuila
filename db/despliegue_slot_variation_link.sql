-- Conexión slot <-> variation
--
-- Cuando un slot entra a `in_campaign`, se crea automáticamente una variation
-- en el concepto correspondiente. Esta migración agrega el vínculo bidireccional
-- para que la creación sea idempotente y los enlaces estén explícitos.

ALTER TABLE despliegue_variations
  ADD COLUMN IF NOT EXISTS source_slot_id UUID
    REFERENCES despliegue_slots(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_despliegue_variations_source_slot
  ON despliegue_variations (source_slot_id);

ALTER TABLE despliegue_slots
  ADD COLUMN IF NOT EXISTS linked_variation_id UUID
    REFERENCES despliegue_variations(id) ON DELETE SET NULL;
