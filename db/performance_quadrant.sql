-- Calificación de creativo por cuadrantes (solo aplica en in_campaign).
-- 4 categorías que combinan inversión × rendimiento:
--   winner   = mucho gasto + buen resultado → escalar
--   bleeder  = mucho gasto + mal resultado  → pausar/revisar
--   underdog = poco gasto + buen resultado  → subir presupuesto
--   fail     = poco gasto + mal resultado   → descartar
--
-- El review_rating (0-10) viejo queda en DB para no perder históricos,
-- pero ya no se usa en la UI.
-- Idempotente.

alter table public.despliegue_slots
  add column if not exists performance_quadrant text,
  add column if not exists performance_quadrant_at timestamptz;

-- Check constraint (drop + recreate para ser idempotente).
do $$ begin
  alter table public.despliegue_slots
    drop constraint if exists despliegue_slots_performance_quadrant_check;
  alter table public.despliegue_slots
    add constraint despliegue_slots_performance_quadrant_check
    check (performance_quadrant is null or performance_quadrant in (
      'winner', 'bleeder', 'underdog', 'fail'
    ));
end $$;

create index if not exists despliegue_slots_quadrant_idx
  on public.despliegue_slots(performance_quadrant)
  where performance_quadrant is not null;

notify pgrst, 'reload schema';
