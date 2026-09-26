-- Generador de guiones IA en el slot del Content Pipeline.
--
-- Tres columnas nuevas, todas aditivas:
--
--   1. `despliegue_variations.script_blueprint` — el esqueleto ESTRUCTURAL que la
--      IA destila de la transcripción de un referente (arquetipo del hook, beats
--      con su propósito y conteo de palabras, arco, nivel de conciencia, objeción,
--      recursos, ritmo, tipo de CTA). NO guarda copy, guarda estructura: por eso
--      se puede cachear para siempre y compartir entre todos los slots que peguen
--      ese referente. Es lo que evita que el guion copie los CLAIMS del anuncio
--      ajeno — el modelo ve una estructura, no un texto para parafrasear.
--
--   2. `pipeline_slots.ai_draft` — el HTML del guion tal como lo generó la IA,
--      congelado en el momento de insertar. Se compara después contra el `script`
--      final editado por el usuario para destilar reglas aprendidas.
--
--   3. `pipeline_slots.ai_meta` — metadatos de esa generación (arquetipos usados,
--      presupuesto de palabras, modelo, fecha, id del referente que dio el
--      blueprint, y el flag `learned` para no re-procesar el loop dos veces).
--
-- Idempotente: se puede correr varias veces sin efecto.

alter table public.despliegue_variations
  add column if not exists script_blueprint jsonb;

alter table public.pipeline_slots
  add column if not exists ai_draft text;

alter table public.pipeline_slots
  add column if not exists ai_meta jsonb not null default '{}'::jsonb;

-- PostgREST cachea el esquema: sin esto no ve las columnas nuevas.
notify pgrst, 'reload schema';
