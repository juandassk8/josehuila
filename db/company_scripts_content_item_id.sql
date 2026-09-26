-- Permite vincular un company_scripts a un content_item (slot del despliegue
-- en el caso del workspace). Sin FK porque el ID puede venir de
-- despliegue_slots (workspace) o content_items (team) — no queremos un FK
-- duro cross-tabla. La FK queda como referencia textual semántica.
-- Idempotente.

alter table public.company_scripts
  add column if not exists content_item_id uuid;

create index if not exists company_scripts_content_item_idx
  on public.company_scripts(content_item_id);

-- Reload PostgREST schema cache (si no, columna no se ve desde el API).
notify pgrst, 'reload schema';
