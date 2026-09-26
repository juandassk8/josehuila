-- Links públicos de brief: la hoja de rodaje que se le manda a una creadora UGC.
--
-- Se abre SIN cuenta, así que el token es la única llave. Va con sufijo aleatorio
-- para que no se pueda adivinar, y se puede desactivar cuando el link ya circuló.
--
-- La tabla NUNCA la lee `anon` — la RLS es solo para `authenticated` (el equipo,
-- que crea y revoca). La página pública entra por `api/brief-share.js`, que usa
-- service_role y devuelve solo los campos que la creadora necesita ver.
--
-- `slot_ids` congela QUÉ guiones incluye el link; el contenido de cada uno se lee
-- en vivo. Así corregir un guion se refleja solo, pero lo que mandaste no cambia
-- de alcance a espaldas de nadie.
--
-- Idempotente.

create table if not exists public.pipeline_share_links (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  company_id text not null,
  brief_id uuid references public.pipeline_briefs(id) on delete cascade,
  brief_name text,
  slot_ids jsonb not null default '[]'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists pipeline_share_links_token_idx on public.pipeline_share_links(token);
create index if not exists pipeline_share_links_company_idx on public.pipeline_share_links(company_id, created_at desc);

alter table public.pipeline_share_links enable row level security;

-- Mismo patrón que el resto del pipeline: equipo o miembro de la empresa.
-- `anon` queda fuera a propósito.
drop policy if exists "share links tenant" on public.pipeline_share_links;
create policy "share links tenant" on public.pipeline_share_links
  for all to authenticated
  using (public.is_team_admin() or company_id in (select public.accessible_company_ids()))
  with check (public.is_team_admin() or company_id in (select public.accessible_company_ids()));

notify pgrst, 'reload schema';
