-- Columnas usadas por la interfaz actual que no figuran en las migraciones históricas.
alter table public.spaces
 add column if not exists description text not null default '',
 add column if not exists parent_space_id uuid references public.spaces(id) on delete cascade;
create index if not exists spaces_parent_idx on public.spaces(parent_space_id);
alter table public.tasks
 add column if not exists due_time text,
 add column if not exists recurrence_pattern text,
 add column if not exists recurrence_interval integer not null default 1,
 add column if not exists recurrence_active boolean not null default false,
 add column if not exists recurrence_parent_id uuid references public.tasks(id) on delete set null,
 add column if not exists recurrence_next_status text;
alter table public.tasks drop constraint if exists tasks_work_type_valid;
alter table public.tasks add constraint tasks_work_type_valid check (work_type is null or work_type in ('profundo','liviano','personal'));
alter table public.company_tasks add column if not exists archived boolean not null default false;
alter table public.reference_inbox add column if not exists ad_copy text;
alter table public.expertise_documents
 add column if not exists raw_content text,
 add column if not exists extracted_summary text;

create table if not exists public.tag_options (
 id uuid primary key default gen_random_uuid(), field_group text not null,
 label text not null, color text not null default 'default', sort_order integer not null default 0,
 created_at timestamptz not null default now(), unique(field_group,label)
);
alter table public.tag_options enable row level security;
drop policy if exists solo_equipo on public.tag_options;
create policy solo_equipo on public.tag_options for all to authenticated using(public.is_team_member()) with check(public.is_team_member());

create table if not exists public.work_pauses (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.team_members(id) on delete cascade,
 kind text not null, task_id uuid, task_label text, note text,
 started_at timestamptz not null default now(), ended_at timestamptz,
 check(ended_at is null or ended_at>=started_at)
);
create unique index if not exists work_pauses_one_active on public.work_pauses(owner_id) where ended_at is null;
alter table public.work_pauses enable row level security;
drop policy if exists own_pauses on public.work_pauses;
create policy own_pauses on public.work_pauses for all to authenticated
using(public.is_team_member() and (owner_id=auth.uid() or public.es_admin_real()))
with check(public.is_team_member() and (owner_id=auth.uid() or public.es_admin_real()));

create or replace function public.task_session_totals()
returns table(task_id uuid, seconds bigint)
language sql stable security invoker set search_path=public,pg_temp as $$
 select s.task_id, coalesce(sum(s.duration_seconds),0)::bigint
 from public.time_tracker_sessions s
 where s.owner_id=auth.uid() and s.task_id is not null and s.ended_at is not null
 group by s.task_id
$$;
