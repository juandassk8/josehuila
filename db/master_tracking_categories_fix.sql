-- =========================================================
-- Fix: agregar categorías faltantes al enum + columna reference_type.
--
-- Bug 2026-04-23: el frontend de Master Tracking usaba categorías
-- "referencias" y "estaticos" + un campo reference_type, pero la DB
-- nunca los tenía. Como los handlers no chequeaban error, los inserts
-- fallaban silenciosamente y los usuarios perdían su trabajo.
-- =========================================================

-- 1. Agregar valores faltantes al enum mt_content_category
do $$ begin
  alter type public.mt_content_category add value if not exists 'referencias';
exception when others then null; end $$;

do $$ begin
  alter type public.mt_content_category add value if not exists 'estaticos';
exception when others then null; end $$;

-- 2. Agregar columna reference_type (solo aplica cuando category = 'referencias')
alter table public.content_milestones
  add column if not exists reference_type text
    check (reference_type is null or reference_type in ('video', 'estatico'));

-- 3. Agregar columnas faltantes en performance_reports
-- El modal manda cost_per_purchase pero la DB nunca tuvo esa columna.
alter table public.performance_reports
  add column if not exists cost_per_purchase numeric,
  add column if not exists cost_per_purchase_target numeric;

notify pgrst, 'reload schema';
