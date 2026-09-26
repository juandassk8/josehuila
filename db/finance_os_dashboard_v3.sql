-- Finance OS Dashboard v3: Budget Items (presupuesto plan vs ejecución).
--
-- Cada item es un concepto recurrente o único (ej: "Supa Base", "Nath", "Wake Up")
-- con expected_amount (total que debería ser) y paid_amount (lo que ya se pagó).
-- Al marcar un item como pagado se crea una transaction enlazada via budget_item_id.
--
-- SAFE: idempotente.

create table if not exists public.finance_budget_items (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('income','expense')),
  name text not null,
  category_id uuid references public.finance_categories(id) on delete set null,
  scope text not null check (scope in ('agency','personal','family','content_capex')),
  account_id uuid references public.finance_accounts(id) on delete set null,
  expected_amount numeric not null default 0,
  paid_amount numeric not null default 0,
  payment_type text not null default 'one_time' check (payment_type in ('one_time','recurring')),
  due_day int check (due_day between 1 and 31),
  due_date date,
  status text not null default 'planned' check (status in ('planned','partial','paid','cancelled')),
  client_id uuid references public.finance_clients(id) on delete set null,
  notes text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists finance_budget_items_category_idx
  on public.finance_budget_items(category_id);
create index if not exists finance_budget_items_scope_idx
  on public.finance_budget_items(scope);
create index if not exists finance_budget_items_status_idx
  on public.finance_budget_items(status);

alter table public.finance_transactions
  add column if not exists budget_item_id uuid references public.finance_budget_items(id) on delete set null;

alter table public.finance_budget_items enable row level security;
drop policy if exists "authenticated all" on public.finance_budget_items;
create policy "authenticated all" on public.finance_budget_items
  for all to authenticated using (true) with check (true);

do $$ begin
  alter publication supabase_realtime add table public.finance_budget_items;
exception when duplicate_object then null;
end $$;

drop trigger if exists finance_budget_items_updated_at on public.finance_budget_items;
create trigger finance_budget_items_updated_at before update on public.finance_budget_items
  for each row execute function public.set_updated_at();

notify pgrst, 'reload schema';
