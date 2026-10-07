-- Durable, company-private intentions. No placeholder IDs in the public catalogue.
create table if not exists public.ad_library_brand_requests (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id) on delete cascade,
  created_by uuid not null,
  input_url text not null check(length(input_url) <= 2048),
  url_hash text not null check(url_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'pending' check(status in ('pending','resolving','needs_selection','ready','cancelled')),
  candidates jsonb not null default '[]'::jsonb check(jsonb_typeof(candidates)='array' and jsonb_array_length(candidates)<=5),
  brand_id uuid references public.ad_library_brands(id),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,url_hash)
);
create index if not exists ad_library_brand_requests_due_idx on public.ad_library_brand_requests(next_attempt_at)
  where status in ('pending','resolving');
alter table public.ad_library_brand_requests enable row level security;
revoke all on public.ad_library_brand_requests from public,anon,authenticated;
grant select,insert,update on public.ad_library_brand_requests to service_role;

create or replace function public.ad_library_claim_brand_request(p_id uuid,p_token uuid)
returns jsonb language plpgsql set search_path=pg_catalog,public as $$
declare r public.ad_library_brand_requests;
begin
  update public.ad_library_brand_requests set status='resolving',lease_token=p_token,lease_until=now()+interval '10 minutes',
    attempts=attempts+1,updated_at=now()
  where id=p_id and ((status='pending' and next_attempt_at<=now()) or (status='resolving' and lease_until<now()))
  returning * into r;
  return case when r.id is null then null else to_jsonb(r) end;
end $$;

-- Candidate identities are written only by the trusted resolver. Never trust a UI-supplied name.
-- Follow creation and request completion commit together, also when two workers/users finish at once.
create or replace function public.ad_library_complete_brand_request(p_id uuid,p_company text,p_page text,p_source text)
returns jsonb language plpgsql set search_path=pg_catalog,public as $$
declare r public.ad_library_brand_requests; candidate jsonb; b public.ad_library_brands;
begin
  select * into r from public.ad_library_brand_requests where id=p_id and company_id=p_company for update;
  if not found then raise exception 'REQUEST_NOT_FOUND' using errcode='22023'; end if;
  if r.status='ready' then
    insert into public.ad_library_follows(company_id,brand_id,active,created_by) values(r.company_id,r.brand_id,true,r.created_by)
      on conflict(company_id,brand_id) do update set active=true;
    return jsonb_build_object('brandId',r.brand_id);
  end if;
  if r.status<>'needs_selection' or p_source not in ('meta_web','meta_official') then
    raise exception 'REQUEST_NOT_READY' using errcode='22023'; end if;
  select value into candidate from jsonb_array_elements(r.candidates) where value->>'pageId'=p_page;
  if candidate is null or p_page !~ '^[0-9]{5,25}$' or length(trim(candidate->>'name')) not between 1 and 160 then
    raise exception 'INVALID_CANDIDATE' using errcode='22023'; end if;
  insert into public.ad_library_brands(source,meta_page_id,country,name) values(p_source,p_page,'ALL',candidate->>'name')
    on conflict(source,meta_page_id,country) do update set name=excluded.name returning * into b;
  insert into public.ad_library_follows(company_id,brand_id,active,alias,created_by) values(r.company_id,b.id,true,null,r.created_by)
    on conflict(company_id,brand_id) do update set active=true,alias=null;
  update public.ad_library_brand_requests set status='ready',brand_id=b.id,last_error=null,lease_token=null,lease_until=null,updated_at=now() where id=r.id;
  return jsonb_build_object('brandId',b.id);
end $$;
revoke all on function public.ad_library_claim_brand_request(uuid,uuid) from public,anon,authenticated;
revoke all on function public.ad_library_complete_brand_request(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.ad_library_claim_brand_request(uuid,uuid) to service_role;
grant execute on function public.ad_library_complete_brand_request(uuid,text,text,text) to service_role;
notify pgrst,'reload schema';
