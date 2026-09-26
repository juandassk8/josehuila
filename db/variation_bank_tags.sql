-- Banco de creativos: tags de nicho por REFERENCIA (variation), independientes
-- del formato y de la empresa. Un mismo formato (ej. "TEXTO") puede agregar refs
-- de varias marcas/nichos, así que cada referencia puede llevar sus propios tags
-- (ej. "Salud y bienestar", "Mascotas") para etiquetarlas en lote.
--
-- Paralelo a despliegue_concepts.bank_tags. Default '{}' → refs existentes sin
-- tags, sin cambiar comportamiento actual.
--
-- Idempotente — seguro de correr múltiples veces.

alter table public.despliegue_variations
  add column if not exists bank_tags text[] not null default '{}';

create index if not exists idx_despliegue_variations_bank_tags
  on public.despliegue_variations using gin (bank_tags);

-- PostgREST necesita reload del schema para ver la columna nueva.
notify pgrst, 'reload schema';
