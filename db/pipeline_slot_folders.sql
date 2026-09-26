-- Content Pipeline: separar la carpeta del MATERIAL CRUDO de la del CREATIVO FINAL.
--
-- Hasta ahora las tres etapas compartían la MISMA columna `drive`, solo cambiando
-- la etiqueta según el momento:
--
--   To Film     → "Carpeta de borradores — subir acá"
--   To Edit     → "Carpeta del material crudo"
--   In Campaign → "Carpeta del creativo"
--
-- O sea que cuando el editor pegaba la carpeta del creativo terminado, PISABA el
-- link del material en crudo. Se perdía dónde estaba el material grabado.
--
-- Con esta columna quedan dos carpetas distintas y el editor ve las dos a la vez
-- en To Edit: de dónde saca el material (`drive_raw`) y dónde tiene que dejar lo
-- terminado (`drive`, que es la que después viaja al despliegue como el creativo).
--
-- `drive` NO se toca: sigue siendo la carpeta del creativo final, que es lo que
-- `upsertProducedFromSlot` manda a `despliegue_variations.drive_url`.
--
-- Idempotente.

alter table public.pipeline_slots
  add column if not exists drive_raw text;

-- PostgREST cachea el esquema: sin esto no ve la columna nueva.
notify pgrst, 'reload schema';
