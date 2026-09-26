-- =========================================================
-- Token usage log para el Guionista (workspace cliente).
--
-- Loguea cada llamada al endpoint /api/generate-script que tenga companyId.
-- Habilita rate-limiting por 3 ventanas rolling: 1h / 24h / 7d.
--
-- Límites por empresa (no por miembro — pool compartido):
--   - 60.000 tokens / hora     (≈ 6 guiones)
--   - 150.000 tokens / 24h     (≈ 15 guiones)
--   - 300.000 tokens / 7 días  (≈ 30 guiones)
--
-- Idempotente.
-- =========================================================

create table if not exists public.company_token_usage (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  member_id uuid references public.company_team_members(id) on delete set null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  total_tokens int generated always as (input_tokens + output_tokens) stored,
  model text,
  -- Contexto opcional: a qué pidió generar (idea/concept/etc.)
  context jsonb,
  created_at timestamptz not null default now()
);

create index if not exists company_token_usage_company_time_idx
  on public.company_token_usage(company_id, created_at desc);

create index if not exists company_token_usage_member_time_idx
  on public.company_token_usage(member_id, created_at desc) where member_id is not null;

-- ---------- RLS permisiva (patrón existente) ----------

alter table public.company_token_usage enable row level security;

drop policy if exists "read company_token_usage" on public.company_token_usage;
create policy "read company_token_usage" on public.company_token_usage
  for select using (true);
drop policy if exists "write company_token_usage" on public.company_token_usage;
create policy "write company_token_usage" on public.company_token_usage
  for all using (true) with check (true);

notify pgrst, 'reload schema';
