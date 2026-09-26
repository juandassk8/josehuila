-- Fase 2: Nomenclatura automática de creativos + UGC/Diseñador asociable.
-- Idempotente. Correr en Supabase SQL Editor.

-- ───── 1. Columnas nuevas en despliegue_slots ─────
alter table public.despliegue_slots
  add column if not exists creative_number integer,
  add column if not exists ugc_id uuid;

create index if not exists despliegue_slots_creative_number_idx
  on public.despliegue_slots(creative_number);
create index if not exists despliegue_slots_ugc_idx
  on public.despliegue_slots(ugc_id) where ugc_id is not null;

-- ───── 2. Tabla company_ugcs (UGCs y diseñadores por empresa) ─────
create table if not exists public.company_ugcs (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  name text not null,
  kind text not null default 'ugc' check (kind in ('ugc', 'designer')),
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists company_ugcs_company_idx
  on public.company_ugcs(company_id);
create index if not exists company_ugcs_kind_idx
  on public.company_ugcs(kind) where archived = false;

alter table public.company_ugcs enable row level security;
drop policy if exists "read company_ugcs" on public.company_ugcs;
create policy "read company_ugcs" on public.company_ugcs for select using (true);
drop policy if exists "write company_ugcs" on public.company_ugcs;
create policy "write company_ugcs" on public.company_ugcs for all using (true) with check (true);

do $$ begin
  alter publication supabase_realtime add table public.company_ugcs;
exception when duplicate_object then null; end $$;

-- ───── 3. Backfill creative_number por empresa (orden por created_at) ─────
-- Asigna 1..N a los slots existentes de cada company. Idempotente por el
-- WHERE creative_number IS NULL: al re-correr, no re-numera los ya numerados.
do $$
declare cid text; sl record; n integer;
begin
  for cid in (
    select distinct b.company_id
    from public.despliegue_boards b
    join public.despliegue_slots s on s.board_id = b.id
    where b.company_id is not null
  ) loop
    -- Obtener el máximo actual (por si hubo numeración previa parcial)
    select coalesce(max(s.creative_number), 0) into n
    from public.despliegue_slots s
    join public.despliegue_boards b on b.id = s.board_id
    where b.company_id = cid;

    for sl in (
      select s.id
      from public.despliegue_slots s
      join public.despliegue_boards b on b.id = s.board_id
      where b.company_id = cid and s.creative_number is null
      order by s.created_at asc
    ) loop
      n := n + 1;
      update public.despliegue_slots set creative_number = n where id = sl.id;
    end loop;
  end loop;
end $$;

-- ───── 4. Trigger BEFORE INSERT — contador atómico por empresa ─────
-- Lock implícito de Postgres en MAX() + INSERT evita duplicados aun con
-- inserts concurrentes (generateSlotsFromPlan crea batch, uno a la vez
-- desde el punto de vista del trigger).
create or replace function public.assign_creative_number()
returns trigger language plpgsql as $$
declare cid text; maxn integer;
begin
  -- Respeta si ya viene asignado (caso: migración manual o import).
  if new.creative_number is not null then
    return new;
  end if;

  select company_id into cid
  from public.despliegue_boards
  where id = new.board_id;

  if cid is null then
    new.creative_number := 1;
    return new;
  end if;

  select coalesce(max(s.creative_number), 0) + 1 into maxn
  from public.despliegue_slots s
  join public.despliegue_boards b on b.id = s.board_id
  where b.company_id = cid;

  new.creative_number := maxn;
  return new;
end $$;

drop trigger if exists trg_despliegue_slots_assign_creative_number
  on public.despliegue_slots;
create trigger trg_despliegue_slots_assign_creative_number
  before insert on public.despliegue_slots
  for each row execute function public.assign_creative_number();

-- ───── 5. Reload PostgREST schema cache ─────
notify pgrst, 'reload schema';
