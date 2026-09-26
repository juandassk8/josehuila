-- Campos para que el guionista cliente tenga contexto completo de cada concepto:
-- - `execution` en despliegue_concepts: estructura paso a paso de cómo se ejecuta el concepto.
-- - `transcript` en despliegue_variations: transcripción del referente (propio o externo).
-- Idempotente.

alter table public.despliegue_concepts
  add column if not exists execution text;

alter table public.despliegue_variations
  add column if not exists transcript text;
