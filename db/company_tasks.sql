-- =========================================================
-- Sistema de tareas por empresa — mirror de tasks/ con aislamiento por company_id
-- Espejo funcional del módulo de Inforce Central (src/team/tasks/*), pero aislado
-- por empresa. Cada cliente tiene su tablero kanban, sus spaces, sus asignados,
-- su timer, su papelera, su feed de actividad — sin mezclarse con las tareas
-- personales de Jose.
--
-- Idempotente. Se puede correr múltiples veces sin romper nada.
-- =========================================================

-- ---------- 1. ENUMs ----------

do $$ begin
  create type company_task_status as enum ('pendiente','en_curso','completado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type company_task_priority as enum ('urgente','alta','normal','baja');
exception when duplicate_object then null; end $$;

-- ---------- 2. Spaces (buckets internos por empresa) ----------

create table if not exists public.company_task_spaces (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  name text not null,
  icon text,
  color text default '#378ADD',
  sort_order int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists company_task_spaces_company_idx
  on public.company_task_spaces(company_id);

-- ---------- 3. Tareas ----------

create table if not exists public.company_tasks (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  space_id uuid references public.company_task_spaces(id) on delete set null,
  title text not null,
  description text,
  status company_task_status not null default 'pendiente',
  priority company_task_priority not null default 'normal',
  due_date date,
  due_time text,
  -- Autoría: member_id real si disponible, label textual como fallback (Admin/Jose).
  created_by uuid references public.company_team_members(id) on delete set null,
  created_by_label text,
  completed_at timestamptz,
  completed_by uuid references public.company_team_members(id) on delete set null,
  sort_order double precision not null default 0,
  -- Timer (cronómetro + temporizador countdown).
  time_spent_seconds int not null default 0,
  timer_started_at timestamptz,
  timer_mode text check (timer_mode in ('cronometro','temporizador')),
  timer_duration_seconds int,
  -- Papelera (soft delete).
  deleted_at timestamptz,
  -- Recurrencia (diario/semanal/mensual con intervalo custom).
  recurrence_pattern text,
  recurrence_interval int,
  recurrence_active boolean default false,
  recurrence_parent_id uuid references public.company_tasks(id) on delete set null,
  recurrence_next_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists company_tasks_company_idx on public.company_tasks(company_id);
create index if not exists company_tasks_status_idx on public.company_tasks(status);
create index if not exists company_tasks_space_idx on public.company_tasks(space_id);
create index if not exists company_tasks_due_idx on public.company_tasks(due_date);
create index if not exists company_tasks_deleted_idx
  on public.company_tasks(deleted_at) where deleted_at is not null;

-- ---------- 4. Asignados (M2M) ----------

create table if not exists public.company_task_assignees (
  task_id uuid references public.company_tasks(id) on delete cascade,
  member_id uuid references public.company_team_members(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (task_id, member_id)
);

create index if not exists company_task_assignees_member_idx
  on public.company_task_assignees(member_id);

-- ---------- 5. Feed de actividad ----------

create table if not exists public.company_task_activity (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  task_id uuid references public.company_tasks(id) on delete cascade,
  member_id uuid references public.company_team_members(id) on delete set null,
  actor_label text, -- fallback cuando Admin crea/actúa sin ser company_member
  action text not null, -- 'created' | 'completed' | 'status_changed' | 'deleted' | 'restored' | 'assigned'
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists company_task_activity_company_idx
  on public.company_task_activity(company_id, created_at desc);

-- ---------- 6. Extender company_team_members con current_task_id ----------

alter table public.company_team_members
  add column if not exists current_task_id uuid;

do $$ begin
  alter table public.company_team_members
    add constraint company_team_members_current_task_fk
    foreign key (current_task_id) references public.company_tasks(id) on delete set null;
exception when duplicate_object then null; end $$;

-- ---------- 7. RLS permisiva (patrón existente) ----------

alter table public.company_task_spaces enable row level security;
alter table public.company_tasks enable row level security;
alter table public.company_task_assignees enable row level security;
alter table public.company_task_activity enable row level security;

drop policy if exists "read company_task_spaces" on public.company_task_spaces;
create policy "read company_task_spaces" on public.company_task_spaces
  for select using (true);
drop policy if exists "write company_task_spaces" on public.company_task_spaces;
create policy "write company_task_spaces" on public.company_task_spaces
  for all using (true) with check (true);

drop policy if exists "read company_tasks" on public.company_tasks;
create policy "read company_tasks" on public.company_tasks
  for select using (true);
drop policy if exists "write company_tasks" on public.company_tasks;
create policy "write company_tasks" on public.company_tasks
  for all using (true) with check (true);

drop policy if exists "read company_task_assignees" on public.company_task_assignees;
create policy "read company_task_assignees" on public.company_task_assignees
  for select using (true);
drop policy if exists "write company_task_assignees" on public.company_task_assignees;
create policy "write company_task_assignees" on public.company_task_assignees
  for all using (true) with check (true);

drop policy if exists "read company_task_activity" on public.company_task_activity;
create policy "read company_task_activity" on public.company_task_activity
  for select using (true);
drop policy if exists "write company_task_activity" on public.company_task_activity;
create policy "write company_task_activity" on public.company_task_activity
  for all using (true) with check (true);

-- ---------- 8. Realtime publication ----------

do $$ begin
  alter publication supabase_realtime add table public.company_tasks;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.company_task_assignees;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.company_task_spaces;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.company_task_activity;
exception when duplicate_object then null; end $$;

-- ---------- 9. Trigger updated_at ----------
-- Intenta reutilizar public.set_updated_at() si ya existe (team_schema.sql la crea).
-- Si no, la define.

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists company_tasks_updated_at on public.company_tasks;
create trigger company_tasks_updated_at
  before update on public.company_tasks
  for each row execute function public.set_updated_at();

drop trigger if exists company_task_spaces_updated_at on public.company_task_spaces;
create trigger company_task_spaces_updated_at
  before update on public.company_task_spaces
  for each row execute function public.set_updated_at();

-- ---------- 10. Trigger de activity log ----------
-- AFTER INSERT/UPDATE en company_tasks, inserta la acción correspondiente en
-- company_task_activity. Permite al War Room mostrar feed "Jose completó X".

create or replace function public.log_company_task_activity()
returns trigger as $$
declare
  v_action text;
  v_actor uuid;
  v_actor_label text;
begin
  -- Determinar la acción según el cambio.
  if TG_OP = 'INSERT' then
    v_action := 'created';
    v_actor := new.created_by;
    v_actor_label := new.created_by_label;
  elsif TG_OP = 'UPDATE' then
    if new.deleted_at is not null and (old.deleted_at is null) then
      v_action := 'deleted';
    elsif new.deleted_at is null and old.deleted_at is not null then
      v_action := 'restored';
    elsif new.status = 'completado' and old.status is distinct from 'completado' then
      v_action := 'completed';
      v_actor := new.completed_by;
    elsif new.status is distinct from old.status then
      v_action := 'status_changed';
    else
      return new; -- update irrelevante (ej: edición de título), no loguear
    end if;
  else
    return new;
  end if;

  insert into public.company_task_activity (
    company_id, task_id, member_id, actor_label, action, payload
  ) values (
    new.company_id,
    new.id,
    coalesce(v_actor, new.completed_by, new.created_by),
    coalesce(v_actor_label, new.created_by_label),
    v_action,
    jsonb_build_object(
      'title', new.title,
      'priority', new.priority,
      'status', new.status
    )
  );

  return new;
end;
$$ language plpgsql;

drop trigger if exists company_tasks_activity_log on public.company_tasks;
create trigger company_tasks_activity_log
  after insert or update on public.company_tasks
  for each row execute function public.log_company_task_activity();
