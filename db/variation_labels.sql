-- Banco de creativos: etiquetas multi-dimensionales por REFERENCIA (variation).
-- Reemplaza al array plano `bank_tags` con un objeto por categorías, para poder
-- etiquetar cada referencia por Marca, Nicho, Ángulo/Problemática y Formato, y así
-- agruparlas / filtrarlas / resaltarlas.
--
-- Shape de bank_labels: { "marca":[...], "nicho":[...], "angulo":[...], "formato":[...] }
-- Arrays → varios valores por categoría. Categorías fijas en el frontend, extensibles.
--
-- Migra los `bank_tags` planos existentes (que eran tags de nicho) a la categoría
-- "nicho" para no perder lo ya etiquetado. La columna bank_tags se conserva.
--
-- Idempotente — seguro de correr múltiples veces.

alter table public.despliegue_variations
  add column if not exists bank_labels jsonb not null default '{}';

create index if not exists idx_despliegue_variations_bank_labels
  on public.despliegue_variations using gin (bank_labels);

update public.despliegue_variations
  set bank_labels = jsonb_build_object('nicho', to_jsonb(bank_tags))
  where bank_tags is not null
    and bank_tags <> '{}'
    and (bank_labels = '{}' or bank_labels is null);

-- PostgREST necesita reload del schema para ver la columna nueva.
notify pgrst, 'reload schema';
