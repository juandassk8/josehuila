-- Finance OS v4: scopes editables + gastos hormiga + drop CHECK constraints rígidos.
-- SAFE: idempotente.

-- Drop CHECK constraints del campo scope text para permitir scopes custom.
-- Conservamos el campo text como cache/legacy; scope_id uuid es la fuente de verdad.
alter table public.finance_categories drop constraint if exists finance_categories_scope_check;
alter table public.finance_transactions drop constraint if exists finance_transactions_scope_check;
alter table public.finance_budget_items drop constraint if exists finance_budget_items_scope_check;
alter table public.finance_subscriptions drop constraint if exists finance_subscriptions_scope_check;

-- Tabla de scopes editables
create table if not exists public.finance_scopes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legacy_key text unique, -- 'agency'|'personal'|'family'|'content_capex' para los 4 originales
  icon text default '📁',
  color text default '#888888',
  allow_income boolean not null default true,
  allow_expense boolean not null default true,
  is_default boolean not null default false,
  archived boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seed con los 4 originales para preservar compat. legacy_key matchea el scope text antiguo.
insert into public.finance_scopes (name, legacy_key, icon, color, allow_income, allow_expense, is_default, sort_order)
values
  ('Agencia',  'agency',        '🏢', '#3B82F6', true,  true, true, 10),
  ('Personal', 'personal',      '🧍', '#A855F7', false, true, true, 20),
  ('Familia',  'family',        '👨‍👩‍👧', '#F97316', false, true, true, 30),
  ('Content',  'content_capex', '🎥', '#D4A93B', false, true, true, 40)
on conflict (legacy_key) do nothing;

-- Columnas scope_id en tablas existentes
alter table public.finance_categories
  add column if not exists scope_id uuid references public.finance_scopes(id) on delete set null;
alter table public.finance_transactions
  add column if not exists scope_id uuid references public.finance_scopes(id) on delete set null;
alter table public.finance_budget_items
  add column if not exists scope_id uuid references public.finance_scopes(id) on delete set null;
alter table public.finance_subscriptions
  add column if not exists scope_id uuid references public.finance_scopes(id) on delete set null;

-- Backfill via legacy_key (simple)
update public.finance_categories c
   set scope_id = s.id from public.finance_scopes s
 where c.scope_id is null and s.legacy_key = c.scope;

update public.finance_transactions t
   set scope_id = s.id from public.finance_scopes s
 where t.scope_id is null and s.legacy_key = t.scope;

update public.finance_budget_items b
   set scope_id = s.id from public.finance_scopes s
 where b.scope_id is null and s.legacy_key = b.scope;

update public.finance_subscriptions sub
   set scope_id = s.id from public.finance_scopes s
 where sub.scope_id is null and s.legacy_key = sub.scope;

-- Gastos hormiga
create table if not exists public.finance_petty_expenses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  amount numeric not null,
  expense_date date not null default current_date,
  payment_method text not null default 'debit' check (payment_method in ('debit','credit','cash')),
  account_id uuid references public.finance_accounts(id) on delete set null,
  budget_item_id uuid references public.finance_budget_items(id) on delete set null,
  scope_id uuid references public.finance_scopes(id) on delete set null,
  category_id uuid references public.finance_categories(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists finance_petty_expenses_date_idx
  on public.finance_petty_expenses(expense_date desc);

-- Trigger updated_at en scopes
drop trigger if exists finance_scopes_updated_at on public.finance_scopes;
create trigger finance_scopes_updated_at before update on public.finance_scopes
  for each row execute function public.set_updated_at();

-- RLS + realtime
do $$
declare t text;
begin
  for t in select unnest(array['finance_scopes','finance_petty_expenses'])
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "authenticated all" on public.%I', t);
    execute format('create policy "authenticated all" on public.%I for all to authenticated using (true) with check (true)', t);
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

notify pgrst, 'reload schema';
