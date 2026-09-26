-- Capa de "Estrategia de venta": cada creativo (slot) puede taggear qué PUNTOS
-- DE CONTACTO ataca (ángulos de venta / objeciones / conciencia). Los puntos se
-- definen por empresa en despliegue_boards.config.touchpoints (jsonb, sin migración);
-- acá guardamos, por slot, el array de ids de los puntos que ese creativo cubre.
--
-- Idempotente. Correr en Supabase SQL Editor como postgres.

alter table public.despliegue_slots
  add column if not exists touchpoints jsonb not null default '[]'::jsonb;

-- Índice GIN para futuras consultas de cobertura por id de punto de contacto.
create index if not exists despliegue_slots_touchpoints_gin
  on public.despliegue_slots using gin (touchpoints);

notify pgrst, 'reload schema';
