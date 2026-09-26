-- =========================================================
-- Voice Learning Loop — RLHF-lite del Guionista
--
-- Cuando el user aprueba un guion, comparamos el AI draft original vs el
-- final editado. Claude extrae patrones ("user borra CTAs en formato X",
-- "user reemplaza 'cabrón' por 'parce'") y los acumula en
-- accumulated_feedback que YA se inyecta en el system prompt como
-- "REGLAS APRENDIDAS CRÍTICO".
--
-- Idempotente.
-- =========================================================

-- 1. Snapshot inmutable del AI draft (jamás se sobrescribe con edits)
alter table public.company_scripts
  add column if not exists ai_draft_content text;

-- Si existe la tabla legacy `scripts` (team Inforce), agregar también
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'scripts') then
    execute 'alter table public.scripts add column if not exists ai_draft_content text';
  end if;
end $$;

-- 2. accumulated_feedback en ambos voice_profile (donde se acumulan patrones)
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'voice_profile') then
    execute 'alter table public.voice_profile add column if not exists accumulated_feedback text';
  end if;
end $$;

alter table public.company_voice_profile
  add column if not exists accumulated_feedback text;

notify pgrst, 'reload schema';
