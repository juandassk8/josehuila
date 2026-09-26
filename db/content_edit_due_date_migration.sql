-- =========================================================
-- INFORCE CENTRAL — Fecha de edición (Fase D)
-- Nueva columna edit_due_date para separar "cuándo se edita"
-- de scheduled_date (que es "cuándo se publica").
-- Aditiva: no toca datos existentes.
-- =========================================================

alter table public.content_items
  add column if not exists edit_due_date date;

create index if not exists content_items_edit_due_date_idx
  on public.content_items(edit_due_date);

-- Verificación (opcional)
-- select id, title, scheduled_date, edit_due_date, status from public.content_items limit 5;
