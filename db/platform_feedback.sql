-- =========================================================
-- Platform Feedback — recolección de feedback de todos los usuarios
-- (workspace cliente, team Inforce, admin) sobre la plataforma.
--
-- 1 botón flotante visible siempre → modal con title + section + body
-- + imágenes (Storage) + opcional Loom URL. Aparece en la vista admin
-- agrupado para que Jose vea todo el feedback en un lugar.
--
-- Idempotente.
-- =========================================================

create table if not exists public.platform_feedback (
  id uuid primary key default gen_random_uuid(),

  -- Identidad del que reporta. Cualquiera puede ser null si no aplica:
  -- admin global = todos null; cliente owner = company_id; team member del
  -- workspace cliente = company_id + member_id; team Inforce (Jose/Nat) =
  -- team_member_id.
  company_id text,
  company_name text,            -- snapshot en el momento del envío
  member_id uuid,               -- company_team_members.id (cliente)
  team_member_id uuid,          -- team_members.id (Inforce Central)
  reporter_name text,           -- snapshot del nombre
  reporter_email text,          -- snapshot del email
  reporter_role text,           -- 'admin' | 'owner' | 'project_manager' | etc.

  -- Contenido del feedback
  section text not null,        -- 'pipeline' | 'guionista' | 'tareas' | etc.
  title text not null,
  body text,                    -- texto descriptivo (markdown plano)
  loom_url text,                -- opcional
  images jsonb default '[]',    -- array de URLs públicas de Storage

  -- Contexto técnico (auto-capturado para debugging)
  url_path text,                -- pathname donde se envió
  user_agent text,
  viewport text,                -- "1920x1080"

  -- Workflow del admin
  status text not null default 'new'
    check (status in ('new', 'in_progress', 'resolved', 'dismissed')),
  admin_notes text,
  resolved_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists platform_feedback_status_idx
  on public.platform_feedback(status, created_at desc);
create index if not exists platform_feedback_company_idx
  on public.platform_feedback(company_id, created_at desc) where company_id is not null;
create index if not exists platform_feedback_section_idx
  on public.platform_feedback(section);

-- Trigger updated_at (reusa la función que ya existe en company_tasks.sql)
drop trigger if exists platform_feedback_updated_at on public.platform_feedback;
create trigger platform_feedback_updated_at
  before update on public.platform_feedback
  for each row execute function public.set_updated_at();

-- RLS permisiva (patrón existente del codebase — cualquier sesión escribe/lee).
alter table public.platform_feedback enable row level security;

drop policy if exists "read platform_feedback" on public.platform_feedback;
create policy "read platform_feedback" on public.platform_feedback
  for select using (true);

drop policy if exists "write platform_feedback" on public.platform_feedback;
create policy "write platform_feedback" on public.platform_feedback
  for all using (true) with check (true);

notify pgrst, 'reload schema';

-- =========================================================
-- Storage bucket para las imágenes adjuntas
-- =========================================================
-- IMPORTANTE: este bloque crea el bucket y las policies. Si ya existe el
-- bucket, no falla.

insert into storage.buckets (id, name, public)
values ('feedback-images', 'feedback-images', true)
on conflict (id) do update set public = true;

-- Policies del bucket: cualquiera puede subir/leer (igual que el resto del
-- patrón de RLS en este proyecto — el aislamiento real vendrá en el sprint
-- de RLS). Las URLs públicas las usa Jose desde el admin.

drop policy if exists "feedback_images_read" on storage.objects;
create policy "feedback_images_read" on storage.objects
  for select using (bucket_id = 'feedback-images');

drop policy if exists "feedback_images_write" on storage.objects;
create policy "feedback_images_write" on storage.objects
  for insert with check (bucket_id = 'feedback-images');

drop policy if exists "feedback_images_update" on storage.objects;
create policy "feedback_images_update" on storage.objects
  for update using (bucket_id = 'feedback-images');

drop policy if exists "feedback_images_delete" on storage.objects;
create policy "feedback_images_delete" on storage.objects
  for delete using (bucket_id = 'feedback-images');
