-- Reemplaza "Voz y Expertise" por "Info del Producto" para el workspace cliente.
-- Cada empresa define su nicho (moda / joyería / suplementos / otro) y una
-- lista de productos con preguntas específicas por nicho. Este contexto
-- alimenta al generador de guiones.
--
-- Guardado dentro de la misma tabla company_voice_profile (que ya es 1
-- fila/empresa) agregando 2 columnas. Las columnas viejas (patterns, phrases,
-- never_say, tone_notes) quedan deprecadas pero no se borran para no romper
-- nada en caliente.
--
-- Idempotente.

alter table public.company_voice_profile
  add column if not exists niche text,
  add column if not exists products jsonb not null default '[]'::jsonb;
