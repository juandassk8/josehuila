-- =========================================================
-- Notifications — bandeja de entrada in-app.
--
-- Casos de uso:
--   1. Auto-tarea asignada a colaborador (stageTasks / reviewTasks)
--   2. Mención en comentario de tarea (futuro)
--   3. Feedback respondido por admin (futuro)
--
-- identity_key polimórfico (mismo patrón que onboarding_progress):
--   - "admin"               (Jose admin global)
--   - "team:<uuid>"         (team Inforce via supabase auth)
--   - "member:<uuid>"       (workspace cliente colaborador)
--   - "owner:<slug>"        (workspace cliente owner PIN client)
--
-- Idempotente.
-- =========================================================

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_key text not null,    -- identity_key del destinatario
  kind text not null,              -- 'task_assigned' | 'review_requested' | 'mention' | ...
  title text not null,
  body text,
  icon text,                       -- emoji o nombre de icono
  link_url text,                   -- adónde llevar al click
  -- Contexto: referencias opcionales a la entidad que disparó la notificación.
  company_id text,
  company_name text,               -- snapshot
  actor_name text,                 -- quién disparó (opcional)
  metadata jsonb,                  -- payload extra
  -- Estado
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_idx
  on public.notifications(recipient_key, created_at desc);
create index if not exists notifications_unread_idx
  on public.notifications(recipient_key, created_at desc) where read_at is null;

-- RLS permisiva (patrón existente — frontend enforza filtrado por recipient_key).
alter table public.notifications enable row level security;

drop policy if exists "read notifications" on public.notifications;
create policy "read notifications" on public.notifications
  for select using (true);
drop policy if exists "write notifications" on public.notifications;
create policy "write notifications" on public.notifications
  for all using (true) with check (true);

-- Realtime para el dropdown live.
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';
