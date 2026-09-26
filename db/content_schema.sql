-- =========================================================
-- INFORCE CENTRAL — Content pipeline schema
-- Additive: only creates NEW tables. Does not touch existing.
-- =========================================================

-- 1. Content status enum
do $$ begin
  create type content_status as enum (
    'idea','scripting','to_film','to_edit','to_post','posted'
  );
exception when duplicate_object then null; end $$;

-- 2. Content kind enum (video, story, post)
do $$ begin
  create type content_kind as enum ('video','story','post');
exception when duplicate_object then null; end $$;

-- 3. Story categories
do $$ begin
  create type story_category as enum (
    'autoridad','educativo','confianza','problema',
    'camino','conexion','ambicion','otro'
  );
exception when duplicate_object then null; end $$;

-- 4. content_items
create table if not exists public.content_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  kind content_kind not null default 'video',
  status content_status not null default 'idea',
  tipo text,                         -- autoridad, educativo, etc (free text for flexibility)
  formato text[],                    -- ['Instagram','TikTok','YouTube']
  referencia_url text,               -- link de referencia / inspiración
  link_loom text,                    -- loom de briefing
  contenido_crudo_url text,          -- raw footage / doc
  video_editado_url text,            -- edited video file
  link_video_final text,             -- published URL
  guion text,                        -- script / guion
  scheduled_date date,               -- when to publish
  story_category story_category,     -- only for kind='story'
  assigned_editor_id uuid references public.team_members(id) on delete set null,
  created_by uuid references public.team_members(id) on delete set null,
  sort_order double precision not null default 0,
  custom_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists content_items_status_idx on public.content_items(status);
create index if not exists content_items_kind_idx on public.content_items(kind);
create index if not exists content_items_date_idx on public.content_items(scheduled_date);
create index if not exists content_items_editor_idx on public.content_items(assigned_editor_id);

-- 5. content_metrics (manual entry per content item)
create table if not exists public.content_metrics (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  views int not null default 0,
  likes int not null default 0,
  comments int not null default 0,
  shares int not null default 0,
  saves int not null default 0,
  reach int not null default 0,
  engagement_rate numeric(6,3),      -- e.g. 4.250 = 4.25%
  screenshot_url text,
  captured_by uuid references public.team_members(id) on delete set null,
  captured_at timestamptz not null default now()
);
create index if not exists content_metrics_item_idx on public.content_metrics(content_item_id);

-- 6. RLS — permissive for MVP (same as team tables)
alter table public.content_items enable row level security;
alter table public.content_metrics enable row level security;

drop policy if exists "authenticated all" on public.content_items;
drop policy if exists "authenticated all" on public.content_metrics;

create policy "authenticated all" on public.content_items
  for all to authenticated using (true) with check (true);
create policy "authenticated all" on public.content_metrics
  for all to authenticated using (true) with check (true);

-- 7. Realtime
do $$ begin
  alter publication supabase_realtime add table public.content_items;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.content_metrics;
exception when duplicate_object then null; end $$;

-- 8. updated_at trigger
drop trigger if exists content_items_updated_at on public.content_items;
create trigger content_items_updated_at before update on public.content_items
  for each row execute function public.set_updated_at();
