-- =========================================================
-- Módulo Guiones scoped por empresa — mirror de guiones_schema con aislamiento
-- por company_id. Cada cliente tiene sus formatos, voice profile, expertise y
-- scripts independientes.
--
-- Idempotente.
-- =========================================================

-- ---------- 1. Formatos de contenido ----------

create table if not exists public.company_script_formats (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  name text not null,
  description text,
  structure text,
  examples jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists company_script_formats_company_idx
  on public.company_script_formats(company_id);

-- ---------- 2. Voice profile (1 fila por empresa) ----------

create table if not exists public.company_voice_profile (
  id uuid primary key default gen_random_uuid(),
  company_id text not null unique,
  patterns text not null default '',
  phrases text default '',
  never_say text default '',
  tone_notes text default '',
  updated_at timestamptz not null default now()
);

-- ---------- 3. Expertise base (1 fila por empresa) ----------

create table if not exists public.company_expertise_base (
  id uuid primary key default gen_random_uuid(),
  company_id text not null unique,
  facebook_ads text default '',
  ecommerce text default '',
  business text default '',
  stories text default '',
  updated_at timestamptz not null default now()
);

-- ---------- 4. Expertise documents ----------

create table if not exists public.company_expertise_documents (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  title text not null,
  content text,
  source_type text, -- 'text' | 'audio' | 'file'
  created_at timestamptz not null default now()
);

create index if not exists company_expertise_documents_company_idx
  on public.company_expertise_documents(company_id);

-- ---------- 5. Scripts generados ----------

create table if not exists public.company_scripts (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  title text not null,
  format_id uuid references public.company_script_formats(id) on delete set null,
  reference_text text default '',
  notes text default '',
  generated_content text default '',
  final_content text default '',
  status text default 'draft' check (status in ('draft', 'approved', 'rejected')),
  feedback text default '',
  chat_history jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists company_scripts_company_idx on public.company_scripts(company_id);
create index if not exists company_scripts_format_idx on public.company_scripts(format_id);

-- ---------- 6. RLS permisiva ----------

alter table public.company_script_formats enable row level security;
alter table public.company_voice_profile enable row level security;
alter table public.company_expertise_base enable row level security;
alter table public.company_expertise_documents enable row level security;
alter table public.company_scripts enable row level security;

drop policy if exists "read company_script_formats" on public.company_script_formats;
create policy "read company_script_formats" on public.company_script_formats for select using (true);
drop policy if exists "write company_script_formats" on public.company_script_formats;
create policy "write company_script_formats" on public.company_script_formats for all using (true) with check (true);

drop policy if exists "read company_voice_profile" on public.company_voice_profile;
create policy "read company_voice_profile" on public.company_voice_profile for select using (true);
drop policy if exists "write company_voice_profile" on public.company_voice_profile;
create policy "write company_voice_profile" on public.company_voice_profile for all using (true) with check (true);

drop policy if exists "read company_expertise_base" on public.company_expertise_base;
create policy "read company_expertise_base" on public.company_expertise_base for select using (true);
drop policy if exists "write company_expertise_base" on public.company_expertise_base;
create policy "write company_expertise_base" on public.company_expertise_base for all using (true) with check (true);

drop policy if exists "read company_expertise_documents" on public.company_expertise_documents;
create policy "read company_expertise_documents" on public.company_expertise_documents for select using (true);
drop policy if exists "write company_expertise_documents" on public.company_expertise_documents;
create policy "write company_expertise_documents" on public.company_expertise_documents for all using (true) with check (true);

drop policy if exists "read company_scripts" on public.company_scripts;
create policy "read company_scripts" on public.company_scripts for select using (true);
drop policy if exists "write company_scripts" on public.company_scripts;
create policy "write company_scripts" on public.company_scripts for all using (true) with check (true);

-- ---------- 7. Realtime ----------

do $$ begin alter publication supabase_realtime add table public.company_scripts; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.company_script_formats; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.company_voice_profile; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.company_expertise_base; exception when duplicate_object then null; end $$;

-- ---------- 8. Trigger updated_at ----------

drop trigger if exists company_script_formats_updated_at on public.company_script_formats;
create trigger company_script_formats_updated_at
  before update on public.company_script_formats
  for each row execute function public.set_updated_at();

drop trigger if exists company_voice_profile_updated_at on public.company_voice_profile;
create trigger company_voice_profile_updated_at
  before update on public.company_voice_profile
  for each row execute function public.set_updated_at();

drop trigger if exists company_expertise_base_updated_at on public.company_expertise_base;
create trigger company_expertise_base_updated_at
  before update on public.company_expertise_base
  for each row execute function public.set_updated_at();

drop trigger if exists company_scripts_updated_at on public.company_scripts;
create trigger company_scripts_updated_at
  before update on public.company_scripts
  for each row execute function public.set_updated_at();
