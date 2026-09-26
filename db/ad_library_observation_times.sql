-- Imported observations retain the time they were seen, not the upload time.
create or replace function public.ad_library_upsert_ads(
  p_brand_id uuid, p_started_at timestamptz, p_ads jsonb
) returns table(id uuid, source_ad_id text, content_hash text)
language sql set search_path = pg_catalog, public as $$
  insert into public.ad_library_ads (
    brand_id, source_ad_id, page_name, body, title, caption, cta,
    landing_url, media_type, source_url, source_start_at, source_stop_at,
    status, content_hash, first_seen, last_seen, last_changed_at
  )
  select p_brand_id, x.source_ad_id, x.page_name, x.body, x.title,
    x.caption, x.cta, x.landing_url, x.media_type, x.source_url,
    x.source_start_at, x.source_stop_at, x.status, x.content_hash,
    p_started_at, p_started_at, p_started_at
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
        or ad_library_ads.status is distinct from excluded.status then excluded.last_seen
      else ad_library_ads.last_changed_at end,
    missing_complete_scans = 0, updated_at = now()
  where excluded.last_seen >= ad_library_ads.last_seen
  returning ad_library_ads.id, ad_library_ads.source_ad_id, ad_library_ads.content_hash;
$$;

-- Correct only records with a single observation and no differing saved version.
update public.ad_library_ads a set last_changed_at = first_seen
where first_seen = last_seen and last_changed_at > first_seen
  and not exists(select 1 from public.ad_library_versions v where v.ad_id = a.id and v.content_hash <> a.content_hash);
notify pgrst, 'reload schema';
