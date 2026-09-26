-- Auto-tareas de revisión: cuando un slot entra a "pide revisión" (requested)
-- en idea/scripting/to_film/to_edit, se crea/actualiza automáticamente una
-- tarea agrupada por (company_id, review_kind) y se asigna a todos los
-- team_members con is_reviewer = true. Idempotente.

-- 1. Flag en team_members para marcar quién recibe las tareas automáticas.
alter table public.team_members
  add column if not exists is_reviewer boolean not null default false;

create index if not exists team_members_reviewer_idx
  on public.team_members(is_reviewer) where is_reviewer = true;

-- 2. Campos nuevos en tasks para tareas auto-generadas con deep-link.
alter table public.tasks
  add column if not exists link_url text,
  add column if not exists slot_id uuid,
  add column if not exists review_kind text,
  add column if not exists auto_generated boolean not null default false;

create index if not exists tasks_review_kind_idx
  on public.tasks(review_kind) where review_kind is not null;
create index if not exists tasks_slot_idx
  on public.tasks(slot_id) where slot_id is not null;
create index if not exists tasks_auto_idx
  on public.tasks(auto_generated) where auto_generated = true;

notify pgrst, 'reload schema';
