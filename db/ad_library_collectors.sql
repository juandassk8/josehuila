-- Additive migration. Apply before running a worker using the collector coordinator.
alter table public.ad_library_crawl_runs
  add column if not exists collector_attempts jsonb not null default '[]'::jsonb,
  add column if not exists collector_engine text,
  add column if not exists completion_evidence jsonb;
-- No raw payloads, proxy addresses, API credentials or historical backfills here.
