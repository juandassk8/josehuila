-- Archivar manualmente cualquier content_item sin importar el status.
-- Patrón paralelo al de companies.archived: soft-hide reversible que NO
-- afecta la semántica del status (killed/promoted siguen siendo estados
-- terminales del pipeline, archived es solo "sacalo de mi vista").
alter table content_items
  add column if not exists archived boolean not null default false;

create index if not exists content_items_archived_idx
  on content_items(archived) where archived = true;
