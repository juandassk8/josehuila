-- Content Pipeline: estados Trial / Killed / Promoted + casillas de publicación.
--
-- IMPORTANTE: content_items.status es un ENUM (`content_status`), no text con
-- CHECK. Por eso usamos ALTER TYPE ADD VALUE en vez de DROP/ADD constraint.
--
-- ALTER TYPE ... ADD VALUE no se permite dentro de un transaction block en
-- algunas versiones de Postgres. Si el SQL Editor se queja, correr el primer
-- bloque (los enum values) y después el resto en una segunda corrida.
--
-- Idempotente — seguro de correr múltiples veces.

-- ── 1. Valores nuevos en el enum content_status ────────────────────────────
alter type content_status add value if not exists 'trial';
alter type content_status add value if not exists 'killed';
alter type content_status add value if not exists 'promoted';

-- ── 2. Timestamps de transición ────────────────────────────────────────────
alter table public.content_items
  add column if not exists posted_at timestamptz,
  add column if not exists trial_at timestamptz;

-- ── 3. Casillas de publicación por destino ────────────────────────────────
-- Shape: { ig_authority: { done, posted_at }, ig_connection: {...},
--          tiktok_authority: {...}, tiktok_connection: {...} }
alter table public.content_items
  add column if not exists publish_destinations jsonb not null default '{}'::jsonb;

-- ── 4. Backfill posted_at para items ya en posted ─────────────────────────
update public.content_items
  set posted_at = coalesce(updated_at, created_at)
  where status = 'posted' and posted_at is null;

-- ── 5. Index para la query del auto-paso a trial ──────────────────────────
create index if not exists idx_content_items_posted_at
  on public.content_items (status, posted_at)
  where status = 'posted';

-- ── 6. PostgREST refresh ─────────────────────────────────────────────────
notify pgrst, 'reload schema';
