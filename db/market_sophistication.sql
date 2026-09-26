-- =====================================================================
-- db/market_sophistication.sql — el nivel de sofisticación del mercado
--
-- Módulo 2 del curso: qué tan quemado está el mercado de oír la misma promesa.
-- Va de 1 (nadie lo prometió antes) a 5 (ya no cree ni promesas ni mecanismos,
-- solo compra identidad). Define el REGISTRO del guion.
--
-- Nullable a propósito, y sin default. "No lo sé todavía" es un estado legítimo
-- y distinto de "es nivel 1": poner 1 por defecto haría que el Guionista escriba
-- claims directos para mercados saturados, que es exactamente el error que esto
-- viene a corregir. Sin dato, el prompt no dice nada sobre sofisticación.
--
-- Correr en el SQL Editor de Supabase. Idempotente.
-- =====================================================================

alter table company_voice_profile
  add column if not exists market_sophistication smallint;

alter table company_voice_profile
  drop constraint if exists company_voice_profile_sofisticacion_check;

alter table company_voice_profile
  add constraint company_voice_profile_sofisticacion_check
  check (market_sophistication is null or market_sophistication between 1 and 5);

notify pgrst, 'reload schema';
