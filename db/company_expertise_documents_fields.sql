-- Alinea el schema de company_expertise_documents con el que usa el código:
-- raw_content (texto crudo del archivo), extracted_summary (resumen de Claude),
-- category (facebook_ads | ecommerce | business | general).
-- Idempotente.

alter table public.company_expertise_documents
  add column if not exists raw_content text,
  add column if not exists extracted_summary text,
  add column if not exists category text default 'general';

-- Backfill: si existe `content` legacy, migralo a raw_content.
update public.company_expertise_documents
  set raw_content = content
  where raw_content is null and content is not null;

-- Agregar a realtime (el resto de company_* ya lo están).
do $$ begin
  alter publication supabase_realtime add table public.company_expertise_documents;
exception when duplicate_object then null; end $$;

-- Reload del schema cache de PostgREST (igual que el fix del source_type).
notify pgrst, 'reload schema';
