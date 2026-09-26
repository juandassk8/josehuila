-- =====================================================================
-- db/perf_indexes.sql — Índices de performance para despliegue_variations
--
-- Estas columnas se filtran con `.in(...)` en cada carga de despliegue, banco y
-- picker del pipeline (enrichCoversFromTwins, listVariationsForBoard,
-- listCompanyCreatives, listBankVariations, resolveCoversForVariations). Sin
-- índice, Postgres hace filtered scan en cada carga. Con índice, son lookups.
--
-- Correr en el SQL Editor de Supabase como postgres. Idempotente. Sin bloqueos
-- pesados (CREATE INDEX; para tablas enormes se puede usar CONCURRENTLY fuera de
-- una transacción, pero acá el volumen es chico).
-- =====================================================================

-- Usado por enrichCoversFromTwins + resolveCoversForVariations (portadas por anuncio).
create index if not exists idx_despliegue_variations_meta_ad_id
  on public.despliegue_variations (meta_ad_id)
  where meta_ad_id is not null;

-- Usado por CASI todas las lecturas de variations (FK a concepts; Postgres no la
-- indexa sola). Acelera listVariationsForBoard / listCompanyCreatives / banco.
create index if not exists idx_despliegue_variations_concept_id
  on public.despliegue_variations (concept_id);

-- Filtro frecuente al separar referentes vs producidos.
create index if not exists idx_despliegue_variations_source_type
  on public.despliegue_variations (source_type);
