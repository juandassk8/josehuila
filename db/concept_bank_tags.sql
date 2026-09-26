-- Banco de creativos: tags de nicho por FORMATO (concepto), independientes de
-- la empresa. Hoy el nicho se deriva de company_voice_profile.niche (por empresa),
-- lo que impide etiquetar un formato puntual (ej. "Salud y bienestar", "Mascotas")
-- sin importar de qué empresa venga.
--
-- `bank_tags` es un array de texto libre. Default '{}' → todos los conceptos
-- existentes quedan sin tags, sin cambiar el comportamiento actual. El user
-- taggea on-demand vía el modal de edición del concepto.
--
-- Índice GIN para filtrar rápido por tag (bank_tags @> ARRAY['...']).
--
-- Idempotente — seguro de correr múltiples veces.

alter table public.despliegue_concepts
  add column if not exists bank_tags text[] not null default '{}';

create index if not exists idx_despliegue_concepts_bank_tags
  on public.despliegue_concepts using gin (bank_tags);

-- PostgREST necesita reload del schema para ver la columna nueva.
notify pgrst, 'reload schema';
