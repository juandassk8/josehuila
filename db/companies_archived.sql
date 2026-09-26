-- Archive flag for visual decluttering. Las empresas archivadas permanecen
-- en DB (reversible) pero quedan ocultas por defecto en las 4 superficies
-- donde se listan empresas: panel general, Master Tracking, Empresas team,
-- y sidebar de /admin. Cada superficie tiene un toggle "Ver archivadas (N)".
alter table companies
  add column if not exists archived boolean not null default false;

create index if not exists companies_archived_idx
  on companies(archived) where archived = true;
