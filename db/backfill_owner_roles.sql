-- Backfill + hardening para Fix #2 del REPORTE_GAPS_CLIENTES.md
-- Correr UNA VEZ en Supabase SQL Editor (orden: A → B → C).
--
-- Contexto: el flujo viejo de createOwnedCompany() en src/landing/auth_db.js
-- tenía un fallback que, si el primer insert fallaba, insertaba al owner SIN
-- el campo `roles: ["owner"]`. Resultado: owners con is_owner=true pero
-- roles=null o roles={}. Esos owners no pasaban los checks de
-- canCreateConceptCanvas / canUseGuionista / canManagePipeline /
-- canManageReports.
--
-- Después del fix de código (auth_db.js usa upsert con onConflict), corremos
-- este script para:
--   A) Crear el unique index que el onConflict necesita (si no existe).
--   B) Reparar las filas históricas con roles vacío.
--   C) Mostrar el resumen post-backfill para verificar.

-- ────────────────────────────────────────────────────────────────────────────
-- A) Unique index sobre (company_id, auth_user_id).
--    El upsert con onConflict: "company_id,auth_user_id" lo requiere.
--    Si ya existe un índice/constraint con esas columnas, esto es no-op.
-- ────────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS company_team_members_company_auth_unique
  ON public.company_team_members (company_id, auth_user_id)
  WHERE auth_user_id IS NOT NULL;
  -- Partial index — auth_user_id puede ser NULL para miembros invitados que
  -- aún no aceptaron el invite. Sólo aplicamos unicidad a los que ya están
  -- conectados a una auth user.

-- ────────────────────────────────────────────────────────────────────────────
-- B) Reparar owners con roles vacío.
--    Aplica sólo a is_owner = true y roles vacío/nulo — no toca a nadie más.
-- ────────────────────────────────────────────────────────────────────────────
UPDATE public.company_team_members
SET roles = ARRAY['owner']
WHERE is_owner = true
  AND (roles IS NULL OR cardinality(roles) = 0);

-- ────────────────────────────────────────────────────────────────────────────
-- C) Verificación post-backfill — debería devolver 0 filas.
--    Si devuelve > 0 hay owners que siguen sin roles (revisar manualmente).
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  id,
  company_id,
  email,
  is_owner,
  roles,
  created_at
FROM public.company_team_members
WHERE is_owner = true
  AND (roles IS NULL OR cardinality(roles) = 0);
