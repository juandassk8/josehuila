-- Catálogo compartido de Bibliotecas de anuncios. Acceso mediante /api/ad-library.
-- Las tablas globales no se exponen directamente a los JWT del navegador.
create table if not exists public.ad_library_brands (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'meta_official',
  meta_page_id text not null check (meta_page_id ~ '^[0-9]{5,25}$'),
  country text not null default 'ALL' check (country = 'ALL' or country ~ '^[A-Z]{2}$'),
  name text not null,
  next_crawl_at timestamptz not null default now(),
  last_crawl_at timestamptz,
  last_crawl_status text,
  created_at timestamptz not null default now(),
  unique (source, meta_page_id, country)
);

create table if not exists public.ad_library_follows (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id) on delete cascade,
  brand_id uuid not null references public.ad_library_brands(id) on delete cascade,
  alias text,
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (company_id, brand_id)
);
create index if not exists ad_library_follows_brand_active_idx
  on public.ad_library_follows(brand_id) where active;

create table if not exists public.ad_library_ads (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.ad_library_brands(id) on delete cascade,
  source_ad_id text not null,
  page_name text,
  body text,
  title text,
  caption text,
  cta text,
  landing_url text,
  media_type text,
  source_url text not null,
  source_start_at timestamptz,
  source_stop_at timestamptz,
  status text not null default 'active' check (status in ('active','inactive','not_observed')),
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  last_changed_at timestamptz not null default now(),
  missing_complete_scans integer not null default 0,
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  updated_at timestamptz not null default now(),
  unique (brand_id, source_ad_id)
);
create index if not exists ad_library_ads_brand_status_seen_idx
  on public.ad_library_ads(brand_id, status, first_seen desc, id desc);
create index if not exists ad_library_ads_brand_last_seen_idx
  on public.ad_library_ads(brand_id, last_seen);

create table if not exists public.ad_library_versions (
  id uuid primary key default gen_random_uuid(),
  ad_id uuid not null references public.ad_library_ads(id) on delete cascade,
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  content jsonb not null,
  captured_at timestamptz not null default now(),
  unique (ad_id, content_hash)
);

create table if not exists public.ad_library_media (
  sha256 text primary key check (sha256 ~ '^[a-f0-9]{64}$'),
  object_key text not null unique,
  mime_type text not null,
  bytes bigint not null check (bytes >= 0),
  created_at timestamptz not null default now()
);
create table if not exists public.ad_library_ad_media (
  ad_id uuid not null references public.ad_library_ads(id) on delete cascade,
  sha256 text not null references public.ad_library_media(sha256),
  kind text not null check (kind in ('image','video')),
  primary key (ad_id, sha256)
);

create table if not exists public.ad_library_crawl_runs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.ad_library_brands(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running','complete','failed')),
  complete_scan boolean not null default false,
  pages_seen integer not null default 0,
  ads_seen integer not null default 0,
  new_ads integer not null default 0,
  changed_ads integer not null default 0,
  error_code text,
  error_message text
);
create index if not exists ad_library_crawl_runs_brand_recent_idx
  on public.ad_library_crawl_runs(brand_id, started_at desc);

-- Merge por lote: conserva first_seen y los identificadores de anuncios existentes.
create or replace function public.ad_library_upsert_ads(
  p_brand_id uuid, p_started_at timestamptz, p_ads jsonb
) returns table(id uuid, source_ad_id text, content_hash text)
language sql set search_path = pg_catalog, public as $$
  insert into public.ad_library_ads (
    brand_id, source_ad_id, page_name, body, title, caption, cta,
    landing_url, media_type, source_url, source_start_at, source_stop_at,
    status, content_hash, first_seen, last_seen
  )
  select p_brand_id, x.source_ad_id, x.page_name, x.body, x.title,
    x.caption, x.cta, x.landing_url, x.media_type, x.source_url,
    x.source_start_at, x.source_stop_at, x.status, x.content_hash,
    p_started_at, p_started_at
  from jsonb_to_recordset(p_ads) as x(
    source_ad_id text, page_name text, body text, title text, caption text,
    cta text, landing_url text, media_type text, source_url text,
    source_start_at timestamptz, source_stop_at timestamptz,
    status text, content_hash text
  )
  on conflict (brand_id, source_ad_id) do update set
    page_name = excluded.page_name, body = excluded.body,
    title = excluded.title, caption = excluded.caption, cta = excluded.cta,
    landing_url = excluded.landing_url, media_type = excluded.media_type,
    source_url = excluded.source_url, source_start_at = excluded.source_start_at,
    source_stop_at = excluded.source_stop_at, status = excluded.status,
    content_hash = excluded.content_hash, last_seen = excluded.last_seen,
    last_changed_at = case
      when ad_library_ads.content_hash is distinct from excluded.content_hash
        or ad_library_ads.status is distinct from excluded.status then now()
      else ad_library_ads.last_changed_at end,
    missing_complete_scans = 0, updated_at = now()
  returning ad_library_ads.id, ad_library_ads.source_ad_id, ad_library_ads.content_hash;
$$;

-- Una ausencia no equivale a anuncio pausado: solo se declara no observado
-- después de dos recorridos completos. El worker llama esta función al terminar.
create or replace function public.ad_library_finish_crawl(
  p_brand_id uuid, p_started_at timestamptz, p_complete boolean
) returns integer language plpgsql as $$
declare affected integer := 0;
begin
  if not p_complete then return 0; end if;
  update public.ad_library_ads
     set missing_complete_scans = missing_complete_scans + 1,
         status = case when missing_complete_scans + 1 >= 2 then 'not_observed' else status end,
         updated_at = now()
   where brand_id = p_brand_id and last_seen < p_started_at and status = 'active';
  get diagnostics affected = row_count;
  return affected;
end $$;

do $$ declare t text; begin
  foreach t in array array['ad_library_brands','ad_library_follows','ad_library_ads',
    'ad_library_versions','ad_library_media','ad_library_ad_media','ad_library_crawl_runs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists ad_library_api_only on public.%I', t);
    execute format('create policy ad_library_api_only on public.%I as restrictive for all to authenticated using (false) with check (false)', t);
  end loop;
end $$;
revoke all on function public.ad_library_finish_crawl(uuid,timestamptz,boolean) from public,anon,authenticated;
revoke all on function public.ad_library_upsert_ads(uuid,timestamptz,jsonb) from public,anon,authenticated;
grant select,insert,update,delete on public.ad_library_brands,public.ad_library_follows,
  public.ad_library_ads,public.ad_library_versions,public.ad_library_media,
  public.ad_library_ad_media,public.ad_library_crawl_runs to service_role;
grant execute on function public.ad_library_finish_crawl(uuid,timestamptz,boolean) to service_role;
grant execute on function public.ad_library_upsert_ads(uuid,timestamptz,jsonb) to service_role;
notify pgrst, 'reload schema';
