-- =====================================================================
-- db/roadmap_foundations.sql — Fundaciones de datos para el roadmap
--   (1) Publicar creativos como anuncios en Facebook / Meta.
--   (2) Leer performance diaria por anuncio y agregar por concepto y ángulo
--       para saber qué vende mejor.
--
-- DISEÑO A FUTURO. Este archivo es ADITIVO y idempotente: crea tablas nuevas
-- y agrega columnas nuevas, NUNCA toca ni borra datos existentes. Nada está
-- cableado al frontend todavía; lo construye el dev del roadmap.
--
-- Correr en Supabase: Dashboard → SQL Editor → pegar y ejecutar (como
-- `postgres`, dueño con BYPASSRLS, para poder crear políticas). Idempotente:
-- seguro de correr múltiples veces.
--
-- RLS: TODAS las tablas nuevas siguen el patrón multi-tenant de
-- db/rls_hardening_v1.sql — enable RLS + política tenant-scoped:
--   using/with check ( public.is_team_admin()
--                      or company_id in (select public.accessible_company_ids()) )
-- NUNCA `for all to anon using (true)` (esa era la brecha que cerramos en v1).
--
-- Supuestos que Jose debe verificar ANTES de correr:
--   * companies.id es TEXT (por eso todos los company_id acá son TEXT). ✔ visto
--     en company_login_lookup() / accessible_company_ids() (setof text).
--   * despliegue_variations NO tiene company_id propio; se scopea por
--     concept_id → despliegue_concepts → board → company. Por eso su RLS NO
--     cambia acá (ya la cubre rls_hardening_v1 vía accessible_concept_ids()),
--     y ad_metrics/ad_publish_jobs guardan company_id denormalizado para poder
--     scopear directo sin joins en la policy.
--   * despliegue_variations ya tiene la columna muerta meta_ad_id (TEXT). La
--     conservamos: al publicar se poblará = fb_ad_id (ver abajo).
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- 1. META AD ACCOUNTS — vincula una empresa con su cuenta publicitaria Meta
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meta_ad_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  ad_account_id TEXT NOT NULL,            -- "act_1234567890" (Marketing API)
  page_id TEXT,                           -- Facebook Page usada como actor del anuncio
  pixel_id TEXT,                          -- Meta Pixel para atribución de conversiones
  business_id TEXT,                       -- Business Manager id (opcional)
  -- REFERENCIA al secreto, NUNCA el token en claro. Guarda acá el id/clave de
  -- un secreto en Supabase Vault (o el nombre de una env var / entrada de un
  -- gestor de secretos). El System User Access Token de Meta se resuelve en el
  -- backend a partir de esta referencia. NO GUARDAR EL TOKEN ACÁ.
  token_secret_ref TEXT,
  token_expires_at TIMESTAMPTZ,           -- vencimiento del token (para avisar/renovar)
  status TEXT NOT NULL DEFAULT 'connected'
    CHECK (status IN ('connected', 'expired', 'revoked', 'error')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (company_id, ad_account_id)
);

CREATE INDEX IF NOT EXISTS idx_meta_ad_accounts_company
  ON meta_ad_accounts (company_id);

-- ─────────────────────────────────────────────────────────────────────
-- 2. DESPLIEGUE_VARIATIONS — columnas de publicación a Facebook
--    La variation es la unidad creativa publicable. Se scopea vía concept
--    (no tiene company_id propio), así que acá solo agregamos columnas FB;
--    su RLS ya la define rls_hardening_v1 (accessible_concept_ids()).
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE despliegue_variations
  ADD COLUMN IF NOT EXISTS fb_campaign_id TEXT,
  ADD COLUMN IF NOT EXISTS fb_adset_id    TEXT,
  ADD COLUMN IF NOT EXISTS fb_ad_id       TEXT,
  ADD COLUMN IF NOT EXISTS fb_creative_id TEXT,
  ADD COLUMN IF NOT EXISTS publish_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (publish_status IN ('draft', 'queued', 'publishing', 'published', 'failed')),
  ADD COLUMN IF NOT EXISTS published_at   TIMESTAMPTZ;

-- Relación con la columna muerta meta_ad_id (que ya existía): al publicar con
-- éxito, el backend debe poblar meta_ad_id = fb_ad_id (mismo valor), para no
-- romper cualquier lectura vieja que apunte a meta_ad_id. fb_ad_id es la fuente
-- de verdad nueva y la clave de join contra ad_metrics.
COMMENT ON COLUMN despliegue_variations.meta_ad_id IS
  'Legacy. Al publicar, poblar = fb_ad_id. Nueva fuente de verdad: fb_ad_id.';
COMMENT ON COLUMN despliegue_variations.fb_ad_id IS
  'Ad id de Meta tras publicar. Clave de join contra ad_metrics.fb_ad_id.';

-- Índice parcial para encontrar rápido lo publicado (join con métricas).
CREATE INDEX IF NOT EXISTS idx_despliegue_variations_fb_ad_id
  ON despliegue_variations (fb_ad_id)
  WHERE fb_ad_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────
-- 3. AD PUBLISH JOBS — una fila por intento de publicación (cola / auditoría)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ad_publish_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  variation_id UUID NOT NULL REFERENCES despliegue_variations(id) ON DELETE CASCADE,
  ad_account_id TEXT,                     -- act_… usado en este intento (snapshot)
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'done', 'failed')),
  request_payload JSONB,                  -- lo que se mandó a la Marketing API
  result JSONB,                           -- respuesta cruda (ids creados, etc.)
  error TEXT,                             -- mensaje de error si status = 'failed'
  attempts INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ad_publish_jobs_company
  ON ad_publish_jobs (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ad_publish_jobs_variation
  ON ad_publish_jobs (variation_id);
-- Cola: buscar rápido lo pendiente que un worker debe tomar.
CREATE INDEX IF NOT EXISTS idx_ad_publish_jobs_pending
  ON ad_publish_jobs (status, created_at)
  WHERE status IN ('queued', 'running');

-- ─────────────────────────────────────────────────────────────────────
-- 4. CREATIVE ANGLES — dimensión "ángulo" referenciada (no jsonb scan)
--    Hoy el ángulo vive en bank_labels->'angulo' (jsonb). Para que "mejor
--    ángulo" sea un join limpio, lo modelamos como tabla. Se conserva
--    bank_labels para ángulos secundarios/legacy (ver doc).
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS creative_angles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                     -- valor mostrable, ej "Ahorro de tiempo"
  -- norm_key = normLabel(name): lowercased + NFD + acentos removidos + trim.
  -- Debe calcularse igual que src/despliegue/labels.js::normLabel para que
  -- "Ahorro", "ahorro" y "Áhorro" colapsen a la misma fila por empresa.
  norm_key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (company_id, norm_key)
);

CREATE INDEX IF NOT EXISTS idx_creative_angles_company
  ON creative_angles (company_id);

-- Ángulo PRIMARIO por variation (nullable). Un solo angle_id: más simple y
-- suficiente para "mejor ángulo". Ángulos adicionales/legacy siguen en
-- bank_labels->'angulo'. (Justificación en ROADMAP_DATA_MODEL.md.)
ALTER TABLE despliegue_variations
  ADD COLUMN IF NOT EXISTS angle_id UUID REFERENCES creative_angles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_despliegue_variations_angle
  ON despliegue_variations (angle_id)
  WHERE angle_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────
-- 5. AD METRICS — tabla de HECHOS, grano DIARIO por anuncio de Meta
--    Join ad_metrics.fb_ad_id → despliegue_variations.fb_ad_id → concept_id
--    (concepto) y → angle_id (ángulo) habilita la analítica "mejor
--    ángulo / mejor concepto". company_id denormalizado para RLS directa.
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ad_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  fb_ad_id TEXT NOT NULL,                 -- join contra despliegue_variations.fb_ad_id
  date DATE NOT NULL,                     -- día del insight (grano)
  spend NUMERIC,                          -- gasto
  impressions BIGINT,
  clicks BIGINT,
  reach BIGINT,
  purchases NUMERIC,                      -- conversiones de compra (pixel)
  revenue NUMERIC,                        -- valor de conversión / purchase value
  roas NUMERIC,                           -- revenue / spend (guardado o calculado en ingest)
  cpa NUMERIC,                            -- spend / purchases
  ctr NUMERIC,                            -- clicks / impressions
  cpc NUMERIC,                            -- spend / clicks
  currency TEXT,                          -- moneda de la cuenta (ej "USD")
  raw JSONB,                              -- fila cruda del insight por si falta algo
  synced_at TIMESTAMPTZ DEFAULT now(),    -- cuándo se hizo el último upsert
  UNIQUE (fb_ad_id, date)                 -- upsert idempotente por anuncio/día
);

-- Agregaciones por empresa y rango de fechas ("este mes", "últimos 7 días").
CREATE INDEX IF NOT EXISTS idx_ad_metrics_company_date
  ON ad_metrics (company_id, date);
-- Join / lookup por anuncio.
CREATE INDEX IF NOT EXISTS idx_ad_metrics_fb_ad_id
  ON ad_metrics (fb_ad_id);

-- =====================================================================
-- RLS — patrón multi-tenant de rls_hardening_v1.sql (REQUERIDO).
-- Todas las tablas nuevas tienen company_id directo → scope directo.
-- =====================================================================
ALTER TABLE meta_ad_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "meta_ad_accounts tenant" ON meta_ad_accounts;
CREATE POLICY "meta_ad_accounts tenant" ON meta_ad_accounts FOR ALL TO authenticated
  USING      ( public.is_team_admin() or company_id in (select public.accessible_company_ids()) )
  WITH CHECK ( public.is_team_admin() or company_id in (select public.accessible_company_ids()) );

ALTER TABLE ad_publish_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ad_publish_jobs tenant" ON ad_publish_jobs;
CREATE POLICY "ad_publish_jobs tenant" ON ad_publish_jobs FOR ALL TO authenticated
  USING      ( public.is_team_admin() or company_id in (select public.accessible_company_ids()) )
  WITH CHECK ( public.is_team_admin() or company_id in (select public.accessible_company_ids()) );

ALTER TABLE creative_angles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "creative_angles tenant" ON creative_angles;
CREATE POLICY "creative_angles tenant" ON creative_angles FOR ALL TO authenticated
  USING      ( public.is_team_admin() or company_id in (select public.accessible_company_ids()) )
  WITH CHECK ( public.is_team_admin() or company_id in (select public.accessible_company_ids()) );

ALTER TABLE ad_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ad_metrics tenant" ON ad_metrics;
CREATE POLICY "ad_metrics tenant" ON ad_metrics FOR ALL TO authenticated
  USING      ( public.is_team_admin() or company_id in (select public.accessible_company_ids()) )
  WITH CHECK ( public.is_team_admin() or company_id in (select public.accessible_company_ids()) );

-- =====================================================================
-- TRIGGERS — mantener updated_at (mismo estilo que despliegue_slots)
-- =====================================================================
CREATE OR REPLACE FUNCTION update_roadmap_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_meta_ad_accounts_updated_at ON meta_ad_accounts;
CREATE TRIGGER trg_meta_ad_accounts_updated_at
  BEFORE UPDATE ON meta_ad_accounts
  FOR EACH ROW EXECUTE FUNCTION update_roadmap_updated_at();

DROP TRIGGER IF EXISTS trg_ad_publish_jobs_updated_at ON ad_publish_jobs;
CREATE TRIGGER trg_ad_publish_jobs_updated_at
  BEFORE UPDATE ON ad_publish_jobs
  FOR EACH ROW EXECUTE FUNCTION update_roadmap_updated_at();

-- PostgREST necesita reload del schema para ver tablas/columnas nuevas.
notify pgrst, 'reload schema';
-- =====================================================================
-- FIN. Ver db/ROADMAP_DATA_MODEL.md para el modelo, los flujos y queries.
-- =====================================================================
