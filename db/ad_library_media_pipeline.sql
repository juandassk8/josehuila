alter table public.ad_library_brands alter column source set default 'meta_web';
alter table public.ad_library_brands add column if not exists last_complete_scan_at timestamptz;
alter table public.ad_library_ads add column if not exists media_content_hash text;
alter table public.ad_library_ads add column if not exists media_error text;
alter table public.ad_library_ad_media add column if not exists position integer not null default 0;
alter table public.ad_library_crawl_runs add column if not exists collection_method text not null default 'live' check (collection_method in ('live', 'stored_capture'));
create table if not exists public.ad_library_media_sources (
  source_key text primary key check (source_key ~ '^[a-f0-9]{64}$'),
  sha256 text not null references public.ad_library_media(sha256),
  created_at timestamptz not null default now()
);
alter table public.ad_library_media_sources enable row level security;
drop policy if exists ad_library_api_only on public.ad_library_media_sources;
create policy ad_library_api_only on public.ad_library_media_sources as restrictive for all to authenticated using (false) with check (false);
grant select,insert,update,delete on public.ad_library_media_sources to service_role;

create or replace function public.ad_library_set_media(p_ad_id uuid, p_content_hash text, p_assets jsonb)
returns boolean language plpgsql set search_path = pg_catalog, public as $$
begin
  perform 1 from public.ad_library_ads where id = p_ad_id and content_hash = p_content_hash for update;
  if not found then return false; end if;
  delete from public.ad_library_ad_media where ad_id = p_ad_id;
  insert into public.ad_library_ad_media(ad_id, sha256, kind, position)
    select p_ad_id, x.sha256, x.kind, x.position
    from jsonb_to_recordset(p_assets) as x(sha256 text, kind text, position integer)
    on conflict (ad_id,sha256) do nothing;
  update public.ad_library_ads set media_content_hash = p_content_hash, media_error = null where id = p_ad_id;
  update public.ad_library_versions set content = content || jsonb_build_object('media', p_assets)
    where ad_id = p_ad_id and content_hash = p_content_hash;
  return true;
end $$;
revoke all on function public.ad_library_set_media(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.ad_library_set_media(uuid,text,jsonb) to service_role;
notify pgrst, 'reload schema';

create or replace function public.ad_library_due_brands()
returns table(id uuid) language sql set search_path = pg_catalog, public as $$
  select b.id from public.ad_library_brands b
  where b.next_crawl_at <= now()
    and exists(select 1 from public.ad_library_follows f where f.brand_id = b.id and f.active)
  order by b.next_crawl_at, b.id limit 200;
$$;
revoke all on function public.ad_library_due_brands() from public,anon,authenticated;
grant execute on function public.ad_library_due_brands() to service_role;

-- A retry of the same completed run cannot count a second absence.
create or replace function public.ad_library_finish_crawl(p_brand_id uuid, p_started_at timestamptz, p_complete boolean)
returns integer language plpgsql set search_path = pg_catalog, public as $$
declare previous_scan timestamptz; affected integer := 0;
begin
  if not p_complete then return 0; end if;
  select last_complete_scan_at into previous_scan from public.ad_library_brands where id = p_brand_id for update;
  if not found or (previous_scan is not null and p_started_at <= previous_scan) then return 0; end if;
  update public.ad_library_ads
    set missing_complete_scans = missing_complete_scans + 1,
        status = case when missing_complete_scans + 1 >= 2 then 'not_observed' else status end,
        updated_at = now()
    where brand_id = p_brand_id and last_seen < p_started_at and status = 'active';
  get diagnostics affected = row_count;
  update public.ad_library_brands set last_complete_scan_at = p_started_at where id = p_brand_id;
  return affected;
end $$;
