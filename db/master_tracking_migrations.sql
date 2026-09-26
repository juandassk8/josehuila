-- Migrations v2 para master_tracking
-- Corre esto en Supabase SQL editor si ya corriste master_tracking_schema.sql

-- Agregar costo por compra (reemplaza spend_target conceptualmente)
alter table public.performance_reports
  add column if not exists cost_per_purchase numeric,
  add column if not exists cost_per_purchase_target numeric;

-- Comentario informativo
comment on column public.performance_reports.spend_target is
  'Ya no se usa en el UI. Se mantiene por compatibilidad.';
comment on column public.performance_reports.cost_per_purchase is
  'Costo por compra real del día (gasto / compras).';
comment on column public.performance_reports.cost_per_purchase_target is
  'Objetivo de costo por compra del cliente.';
