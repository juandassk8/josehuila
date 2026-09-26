-- Finance OS Dashboard v2:
-- - is_owner_pay: marca el sueldo del fundador en team_costs
-- - payment_type: distingue ingresos one-off vs retainers en transacciones
--
-- SAFE: idempotente.

alter table public.finance_team_costs
  add column if not exists is_owner_pay boolean not null default false;

alter table public.finance_transactions
  add column if not exists payment_type text default 'one_time'
    check (payment_type in ('one_time','recurring'));

notify pgrst, 'reload schema';
