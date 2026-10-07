-- Apply after ad_library_collectors.sql. Public observations only; tenant access remains in API.
begin;
create table if not exists public.ad_library_signal_days (
  brand_id uuid not null references public.ad_library_brands(id) on delete cascade,
  run_id uuid not null references public.ad_library_crawl_runs(id),
  observed_day date not null,
  observed_at timestamptz not null,
  country text not null,
  active_status text not null check (active_status = 'active'),
  ordering text not null check (ordering = 'total_impressions_desc_request'),
  entries jsonb not null check (jsonb_typeof(entries) = 'array' and jsonb_array_length(entries) between 5 and 10000),
  primary key (brand_id, observed_day, country)
);
alter table public.ad_library_signal_days enable row level security;
revoke all on public.ad_library_signal_days from public, anon, authenticated;
grant all on public.ad_library_signal_days to service_role;
create index if not exists adlib_signal_recent on public.ad_library_signal_days (brand_id, observed_at desc);
notify pgrst, 'reload schema';
commit;
