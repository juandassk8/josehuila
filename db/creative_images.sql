-- Additive, VPS PostgreSQL only. MCP credentials and images are not exposed by PostgREST.
create schema if not exists app_private;
create or replace function app_private.creative_company_access(p_user uuid, p_company text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists (select 1 from auth.users u join public.companies c on c.id=p_company
    where u.id=p_user and not u.disabled
      and not exists(select 1 from public.team_members t where t.id=u.id and not coalesce(t.active,true))
      and (c.owner_user_id=u.id
        or exists(select 1 from public.team_members t where t.id=u.id and coalesce(t.active,true) and t.role in ('admin','member'))
        or exists(select 1 from public.client_users t where t.user_id=u.id and t.company_id=c.id)
        or exists(select 1 from public.company_team_members t where t.company_id=c.id and
          (t.auth_user_id=u.id or lower(t.email)=lower(u.email)))))
$$;
revoke all on function app_private.creative_company_access(uuid,text) from public,anon,authenticated;
grant execute on function app_private.creative_company_access(uuid,text) to inforce;

create table if not exists app_private.creative_mcp_clients (
  id text primary key, redirect_uri text not null, created_at timestamptz not null default now()
);
create table if not exists app_private.creative_mcp_codes (
  code_hash text primary key, client_id text not null references app_private.creative_mcp_clients(id),
  redirect_uri text not null, challenge text not null, resource text not null, scope text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  user_version integer not null, company_id text not null references public.companies(id) on delete cascade,
  expires_at timestamptz not null
);
create table if not exists app_private.creative_mcp_grants (
  id uuid primary key, client_id text not null references app_private.creative_mcp_clients(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_version integer not null, company_id text not null references public.companies(id) on delete cascade,
  resource text not null, scope text not null, access_hash text unique not null, refresh_hash text unique not null,
  access_expires_at timestamptz not null, expires_at timestamptz not null,
  revoked_at timestamptz, created_at timestamptz not null default now()
);
create index if not exists creative_mcp_grants_owner on app_private.creative_mcp_grants(user_id,company_id);
create table if not exists app_private.creative_images (
  id uuid primary key, company_id text not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id), ad_id uuid not null references public.ad_library_ads(id),
  product_id text not null, product_name text not null, title text not null,
  source_file_id text not null, sha256 text not null, object_key text not null, mime_type text not null,
  bytes integer not null check(bytes>0 and bytes<=20971520),
  origin text not null default 'chatgpt_file' check(origin='chatgpt_file'),
  created_at timestamptz not null default now(), unique(company_id,user_id,source_file_id)
);
create index if not exists creative_images_company_date on app_private.creative_images(company_id,created_at desc,id);
revoke all on app_private.creative_mcp_clients,app_private.creative_mcp_codes,app_private.creative_mcp_grants,app_private.creative_images from public,anon,authenticated;
grant usage on schema app_private to inforce;
grant select,insert,update,delete on app_private.creative_mcp_clients,app_private.creative_mcp_codes,app_private.creative_mcp_grants,app_private.creative_images to inforce;

-- Read narrowly scoped context through a definer function; the runtime role cannot bypass catalog RLS.
create or replace function app_private.creative_context(p_user uuid,p_company text,p_ad uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare context jsonb;
begin
  if not app_private.creative_company_access(p_user,p_company) then raise exception 'creative_access_denied'; end if;
  select jsonb_build_object('company',jsonb_build_object('id',c.id,'name',c.name),
    'products',coalesce(v.products,'[]'::jsonb)) into context
    from companies c left join company_voice_profile v on v.company_id=c.id where c.id=p_company;
  return context || jsonb_build_object('references',coalesce((
    select jsonb_agg(to_jsonb(ref)) from (
      select a.id,a.page_name,a.title,a.body,a.content_hash,a.media_content_hash,
        (select coalesce(jsonb_agg(jsonb_build_object('object_key',m.object_key,'mime_type',m.mime_type,
          'position',am.position) order by am.position),'[]'::jsonb)
          from ad_library_ad_media am join ad_library_media m on m.sha256=am.sha256
          where am.ad_id=a.id and am.kind='image' and a.content_hash=a.media_content_hash) as media
      from ad_library_ads a join ad_library_saves s on s.ad_id=a.id and s.company_id=p_company and s.user_id=p_user
      where (p_ad is null or a.id=p_ad) and exists(select 1 from ad_library_follows f
        where f.company_id=p_company and f.brand_id=a.brand_id and f.active)
      and exists(select 1 from ad_library_ad_media am where am.ad_id=a.id and am.kind='image')
      order by s.created_at desc limit 30
    ) ref),'[]'::jsonb));
end $$;
revoke all on function app_private.creative_context(uuid,text,uuid) from public,anon,authenticated;
grant execute on function app_private.creative_context(uuid,text,uuid) to inforce;

create or replace function app_private.creative_companies(p_user uuid) returns table(id text,name text)
language sql stable security definer set search_path=public,pg_temp as $$
  select c.id,c.name from companies c where app_private.creative_company_access(p_user,c.id) order by c.name limit 500
$$;
revoke all on function app_private.creative_companies(uuid) from public,anon,authenticated;
grant execute on function app_private.creative_companies(uuid) to inforce;
