-- =========================================================
-- Agrega product_id a despliegue_slots y company_scripts.
-- Tag por producto para aislamiento total: cuando se generan guiones,
-- el prompt al LLM solo incluye el producto seleccionado, evitando que
-- la IA mezcle datos entre productos de la misma empresa.
--
-- product_id es text (no FK) porque los productos viven dentro de
-- company_voice_profile.products jsonb — cada uno con un id string
-- generado en frontend (`p_<timestamp>_<random>`).
-- =========================================================

alter table public.despliegue_slots
  add column if not exists product_id text;

create index if not exists despliegue_slots_product_idx
  on public.despliegue_slots(product_id) where product_id is not null;

alter table public.company_scripts
  add column if not exists product_id text;

create index if not exists company_scripts_product_idx
  on public.company_scripts(product_id) where product_id is not null;

notify pgrst, 'reload schema';
