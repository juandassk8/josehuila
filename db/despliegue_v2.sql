-- Despliegue Creativo — v2: canvas estilo Miro con conceptos + ejemplos
-- Agrega campo description a conceptos y habilita Supabase Storage.
-- Idempotente.

-- ────────────────────────────────────────────────────────────────────────
-- Esquema
-- ────────────────────────────────────────────────────────────────────────

ALTER TABLE despliegue_concepts ADD COLUMN IF NOT EXISTS description TEXT;

-- `file_url` ya existe en despliegue_variations; lo usaremos como la imagen
-- principal del ejemplo (ya sea subida o scraped desde Meta Ads Library).

-- ────────────────────────────────────────────────────────────────────────
-- Storage bucket para subir imágenes de ejemplos
-- Debes crearlo manualmente en Supabase Dashboard → Storage → New bucket:
--   Nombre: despliegue-examples
--   Public: YES (para que los clientes las vean sin auth)
-- O correr este SQL desde el SQL editor (requiere Supabase >= 2.x):
-- ────────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('despliegue-examples', 'despliegue-examples', true)
ON CONFLICT (id) DO NOTHING;

-- Policy: cualquiera puede leer imágenes del bucket.
DROP POLICY IF EXISTS "public read despliegue-examples" ON storage.objects;
CREATE POLICY "public read despliegue-examples"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'despliegue-examples');

-- Policy: authenticated users (team) y anon (clientes con PIN) pueden subir.
DROP POLICY IF EXISTS "upload despliegue-examples" ON storage.objects;
CREATE POLICY "upload despliegue-examples"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'despliegue-examples');

DROP POLICY IF EXISTS "update despliegue-examples" ON storage.objects;
CREATE POLICY "update despliegue-examples"
  ON storage.objects FOR UPDATE
  TO anon, authenticated
  USING (bucket_id = 'despliegue-examples');

DROP POLICY IF EXISTS "delete despliegue-examples" ON storage.objects;
CREATE POLICY "delete despliegue-examples"
  ON storage.objects FOR DELETE
  TO anon, authenticated
  USING (bucket_id = 'despliegue-examples');
