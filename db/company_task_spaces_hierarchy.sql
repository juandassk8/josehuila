-- Jerarquía en company_task_spaces: permite sub-espacios (padre → hijos).
-- Ej: "Agencias" (root) → "BHQ" (child).
-- Idempotente.

alter table public.company_task_spaces
  add column if not exists parent_id uuid references public.company_task_spaces(id) on delete cascade;

create index if not exists company_task_spaces_parent_idx
  on public.company_task_spaces(parent_id);
