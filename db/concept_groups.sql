-- Habilita merge cross-empresa de conceptos vía agrupación.
-- Conceptos con el mismo concept_group_id son hermanos; sus variations
-- se ven juntas en el despliegue de cada empresa miembro, ordenadas
-- "own-company first".
-- Idempotente.

alter table public.despliegue_concepts
  add column if not exists concept_group_id uuid;

create index if not exists despliegue_concepts_group_idx
  on public.despliegue_concepts(concept_group_id)
  where concept_group_id is not null;

notify pgrst, 'reload schema';
