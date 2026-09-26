-- Reglas IA por empresa: campo "obligatorio mencionar".
--
-- Complementa los campos que ya existen en company_voice_profile:
--   - never_say         → "lo que JAMAS dice ni hace" (existente)
--   - accumulated_feedback → recomendaciones aprendidas (existente, ver voice_learning_loop.sql)
--
-- must_say se llena desde VoiceExpertisePanel o desde el popup "Ajustar con IA"
-- (kind=must) y se inyecta en el system prompt como seccion OBLIGATORIO MENCIONAR.

alter table public.company_voice_profile
  add column if not exists must_say text default '';
