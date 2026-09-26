-- =========================================================
-- INFORCE FINANCE OS — Fase 1: schema base
--
-- Modulo de finanzas personales/agencia. Solo admin (Jose) accede via
-- canAccessViewByRole. RLS permisiva en MVP (consistente con el resto del
-- portal). Tablas prefijadas con `finance_` para no colisionar con `accounts`,
-- `clients`, `subscriptions`, `goals`, `team_members` que ya existen en
-- otros modulos o pueden agregarse en el futuro.
--
-- SAFE: idempotente. Se puede re-correr sin problemas.
-- =========================================================

-- Cuentas de dinero (bancos, efectivo, tarjetas)
create table if not exists public.finance_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('bank','cash','digital_wallet','crypto','credit_card')),
  currency text not null default 'COP',
  current_balance numeric not null default 0,
  credit_limit numeric,
  color text default '#1D9E75',
  icon text default '🏦',
  is_active boolean not null default true,
  sort_order int not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Categorias income/expense por scope
create table if not exists public.finance_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('income','expense')),
  scope text not null check (scope in ('agency','personal','family','content_capex')),
  parent_category_id uuid references public.finance_categories(id) on delete set null,
  color text default '#888888',
  icon text,
  is_default boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Clientes (de la agencia, independientes de `companies` del portal)
create table if not exists public.finance_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active' check (status in ('prospect','active','paused','churned')),
  monthly_value numeric default 0,
  payment_day int check (payment_day between 1 and 31),
  payment_terms text,
  start_date date,
  end_date date,
  source text,
  notes text,
  pipeline_stage text,
  pipeline_probability numeric default 0,
  company_id text,
  color text default '#1D9E75',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Miembros del equipo con costo de payroll
create table if not exists public.finance_team_costs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text,
  monthly_cost numeric not null default 0,
  payment_day int check (payment_day between 1 and 31),
  payment_method text,
  status text not null default 'active' check (status in ('active','inactive')),
  start_date date,
  end_date date,
  covered_by_client_ids uuid[] default '{}',
  member_id uuid,
  notes text,
  created_at timestamptz not null default now()
);

-- Suscripciones SaaS
create table if not exists public.finance_subscriptions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  monthly_cost numeric not null default 0,
  billing_day int check (billing_day between 1 and 31),
  category text,
  scope text check (scope in ('agency','personal','family','content_capex')),
  status text not null default 'active' check (status in ('active','paused','cancelled')),
  last_used_date date,
  url text,
  cancel_url text,
  notes text,
  created_at timestamptz not null default now()
);

-- Transacciones (la tabla maestra)
create table if not exists public.finance_transactions (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('income','expense')),
  amount numeric not null,
  currency text not null default 'COP',
  category_id uuid references public.finance_categories(id) on delete set null,
  subcategory text,
  account_id uuid not null references public.finance_accounts(id) on delete restrict,
  scope text not null check (scope in ('agency','personal','family','content_capex')),
  description text,
  counterparty text,
  transaction_date date not null,
  due_date date,
  paid_date date,
  status text not null default 'completed' check (status in ('pending','completed','overdue','cancelled')),
  is_recurring boolean not null default false,
  recurrence_rule text,
  client_id uuid references public.finance_clients(id) on delete set null,
  subscription_id uuid references public.finance_subscriptions(id) on delete set null,
  team_cost_id uuid references public.finance_team_costs(id) on delete set null,
  receipt_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists finance_transactions_date_idx
  on public.finance_transactions(transaction_date desc);
create index if not exists finance_transactions_status_idx
  on public.finance_transactions(status) where status != 'completed';
create index if not exists finance_transactions_scope_idx
  on public.finance_transactions(scope);
create index if not exists finance_transactions_category_idx
  on public.finance_transactions(category_id);
create index if not exists finance_transactions_account_idx
  on public.finance_transactions(account_id);
create index if not exists finance_transactions_client_idx
  on public.finance_transactions(client_id);

-- Deudas bidireccionales
create table if not exists public.finance_debts (
  id uuid primary key default gen_random_uuid(),
  counterparty_name text not null,
  direction text not null check (direction in ('owed_to_me','i_owe')),
  amount numeric not null,
  due_date date,
  status text not null default 'pending' check (status in ('pending','partial','paid','cancelled')),
  notes text,
  created_at timestamptz not null default now()
);

-- Metas y objetivos
create table if not exists public.finance_goals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  target_value numeric,
  current_value numeric default 0,
  unit text default 'COP',
  scope text,
  deadline date,
  status text not null default 'active' check (status in ('active','completed','paused','dropped')),
  created_at timestamptz not null default now()
);

-- RLS permisiva (MVP — gating es client-side via canAccessView)
do $$
declare t text;
begin
  for t in select unnest(array[
    'finance_accounts','finance_categories','finance_clients',
    'finance_team_costs','finance_subscriptions','finance_transactions',
    'finance_debts','finance_goals'
  ])
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "authenticated all" on public.%I', t);
    execute format('create policy "authenticated all" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- Realtime
do $$
declare t text;
begin
  for t in select unnest(array[
    'finance_accounts','finance_categories','finance_clients',
    'finance_team_costs','finance_subscriptions','finance_transactions',
    'finance_debts','finance_goals'
  ])
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- Trigger updated_at (reusa public.set_updated_at de team_schema)
drop trigger if exists finance_transactions_updated_at on public.finance_transactions;
create trigger finance_transactions_updated_at before update on public.finance_transactions
  for each row execute function public.set_updated_at();
drop trigger if exists finance_accounts_updated_at on public.finance_accounts;
create trigger finance_accounts_updated_at before update on public.finance_accounts
  for each row execute function public.set_updated_at();
drop trigger if exists finance_clients_updated_at on public.finance_clients;
create trigger finance_clients_updated_at before update on public.finance_clients
  for each row execute function public.set_updated_at();

-- Seed: categorias default
insert into public.finance_categories (name, type, scope, color, icon, is_default, sort_order) values
  ('Equipo / Payroll', 'expense', 'agency', '#3B82F6', '👥', true, 10),
  ('Herramientas / SaaS', 'expense', 'agency', '#8B5CF6', '🔧', true, 20),
  ('Marketing', 'expense', 'agency', '#EC4899', '📣', true, 30),
  ('Imprevistos operativos', 'expense', 'agency', '#F59E0B', '⚠️', true, 40),
  ('Impuestos', 'expense', 'agency', '#EF4444', '🏛️', true, 50),
  ('Retainer', 'income', 'agency', '#1D9E75', '💵', true, 10),
  ('Proyecto puntual', 'income', 'agency', '#10B981', '📦', true, 20),
  ('Alimentación', 'expense', 'personal', '#F97316', '🍔', true, 10),
  ('Salud', 'expense', 'personal', '#EF4444', '⚕️', true, 20),
  ('Movilidad', 'expense', 'personal', '#06B6D4', '🚗', true, 30),
  ('Ocio', 'expense', 'personal', '#EC4899', '🎮', true, 40),
  ('Ropa', 'expense', 'personal', '#A855F7', '👕', true, 50),
  ('Educación', 'expense', 'personal', '#3B82F6', '📚', true, 60),
  ('Arriendo', 'expense', 'family', '#8B5CF6', '🏠', true, 10),
  ('Servicios', 'expense', 'family', '#06B6D4', '💡', true, 20),
  ('Apoyo familiar', 'expense', 'family', '#EC4899', '👨‍👩‍👧', true, 30),
  ('Alimentación familia', 'expense', 'family', '#F97316', '🛒', true, 40),
  ('Equipos', 'expense', 'content_capex', '#D4A93B', '📷', true, 10),
  ('Software de producción', 'expense', 'content_capex', '#8B5CF6', '🎬', true, 20),
  ('Locaciones', 'expense', 'content_capex', '#F59E0B', '🏢', true, 30),
  ('Producción específica', 'expense', 'content_capex', '#EC4899', '🎥', true, 40)
on conflict do nothing;

notify pgrst, 'reload schema';
