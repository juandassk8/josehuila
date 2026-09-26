-- Bandeja de Referentes ("Por revisar") — staging inbox de anuncios candidatos.
--
-- Fase 1 (manual): el equipo pega links de anuncios; Jose revisa (aprobar/
-- rechazar/recategorizar) y los carga al Banco de creativos. Fase 2 (IA): un
-- agente descarga/transcribe/clasifica y pre-llena los `suggested_*` — por eso
-- TODAS esas columnas ya existen aquí (nullables): cero migración al llegar a F2.
--
-- Team-only: el Banco vive en /equipo (solo team_members). RLS espeja la
-- Sección H de rls_hardening_v1.sql. `company_id` es TEXT (companies.id es TEXT
-- legacy) sin FK. Idempotente. Correr en Supabase SQL Editor como postgres.

create table if not exists public.reference_inbox (
  id uuid primary key default gen_random_uuid(),

  -- Núcleo (Fase 1)
  created_by uuid,                                  -- auth.uid() de quien lo agregó
  source_url text not null,                         -- link del anuncio (Meta/Foreplay/…)
  source_platform text,                             -- meta | tiktok | foreplay | other
  status text not null default 'pending'
    check (status in ('pending','enriching','ready','approved','rejected','imported')),
  company_id text,                                  -- empresa destino (null = banco neutral)
  pipeline_type text not null default 'ads',        -- ads | organic
  note text,

  -- Referente candidato (lo llena Jose en F1, la IA en F2 — mismos campos)
  suggested_format text,                            -- "B-roll voz en off", "Noticia", …
  suggested_stage text,                             -- tofu | mofu | bofu
  suggested_media_type text,                        -- static | video
  suggested_name text,                              -- hook / nombre
  suggested_description text,
  suggested_labels jsonb not null default '{}'::jsonb,   -- {marca,nicho,angulo,formato}
  cover_url text,                                   -- portada (→ file_url)
  video_backup_url text,                            -- respaldo Drive (→ drive_url)
  transcript text,

  -- Metadata IA (Fase 2, nullable ahora)
  source_kind text not null default 'manual',       -- manual | ai
  ai_confidence numeric,
  ai_raw jsonb,
  enriched_at timestamptz,
  duplicate_of uuid,

  -- Concepto destino pre-elegido en la captura (formato existente al que van
  -- estos links). null = crear formato nuevo con suggested_format al cargar.
  target_concept_id uuid,

  -- Vínculo al commit (cuando se carga al banco)
  resulting_concept_id uuid,
  resulting_variation_id uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Aditivo idempotente (para tablas ya creadas por una versión previa).
alter table public.reference_inbox add column if not exists target_concept_id uuid;

create index if not exists reference_inbox_status_idx
  on public.reference_inbox(status, created_at desc);
create index if not exists reference_inbox_company_idx
  on public.reference_inbox(company_id);
create index if not exists reference_inbox_labels_gin
  on public.reference_inbox using gin (suggested_labels);

-- updated_at automático.
create or replace function public.reference_inbox_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists reference_inbox_set_updated_at on public.reference_inbox;
create trigger reference_inbox_set_updated_at
  before update on public.reference_inbox
  for each row execute function public.reference_inbox_touch_updated_at();

-- RLS: team-only (solo team_members / admins internos). Espeja Sección H.
alter table public.reference_inbox enable row level security;
drop policy if exists "reference_inbox team only" on public.reference_inbox;
drop policy if exists "reference_inbox open auth" on public.reference_inbox;
create policy "reference_inbox team only" on public.reference_inbox
  for all to authenticated
  using (public.is_team_admin())
  with check (public.is_team_admin());

notify pgrst, 'reload schema';
