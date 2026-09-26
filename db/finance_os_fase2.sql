-- =========================================================
-- INFORCE FINANCE OS — Fase 2: AI Advisor + Voice + Action Engine
--
-- Agrega 4 tablas para soportar el chat con IA, captura por voz y to-do
-- list de acciones recomendadas. Sigue siendo single-user (Jose) — RLS
-- permisiva, gating client-side.
--
-- SAFE: idempotente.
-- =========================================================

-- Conversaciones con el AI Advisor
create table if not exists public.finance_ai_conversations (
  id uuid primary key default gen_random_uuid(),
  title text,
  topic text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Mensajes individuales de cada conversación
create table if not exists public.finance_ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.finance_ai_conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  context_snapshot jsonb,
  token_count int,
  created_at timestamptz not null default now()
);

create index if not exists finance_ai_messages_conversation_idx
  on public.finance_ai_messages(conversation_id, created_at);

-- Logs de captura por voz (para auditar errores y refinar prompts)
create table if not exists public.finance_voice_logs (
  id uuid primary key default gen_random_uuid(),
  audio_duration_sec int,
  transcription text,
  parsed_data jsonb,
  resulting_transaction_id uuid references public.finance_transactions(id) on delete set null,
  status text not null default 'parsed' check (status in ('processing','parsed','confirmed','rejected','failed')),
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists finance_voice_logs_created_idx
  on public.finance_voice_logs(created_at desc);

-- Action Engine: tareas que vienen del AI o se crean a mano
create table if not exists public.finance_actions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  priority text not null default 'medium' check (priority in ('low','medium','high','critical')),
  status text not null default 'pending' check (status in ('pending','in_progress','completed','dismissed')),
  deadline date,
  generated_by text not null default 'user' check (generated_by in ('ai','user')),
  related_conversation_id uuid references public.finance_ai_conversations(id) on delete set null,
  completed_at timestamptz,
  outcome_notes text,
  created_at timestamptz not null default now()
);

create index if not exists finance_actions_status_idx
  on public.finance_actions(status) where status != 'completed';
create index if not exists finance_actions_priority_idx
  on public.finance_actions(priority);

-- updated_at trigger en conversations
drop trigger if exists finance_ai_conversations_updated_at on public.finance_ai_conversations;
create trigger finance_ai_conversations_updated_at before update on public.finance_ai_conversations
  for each row execute function public.set_updated_at();

-- RLS permisiva (MVP, gating client-side)
do $$
declare t text;
begin
  for t in select unnest(array[
    'finance_ai_conversations','finance_ai_messages',
    'finance_voice_logs','finance_actions'
  ])
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "authenticated all" on public.%I', t);
    execute format('create policy "authenticated all" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- Realtime
do $$
declare t text;
begin
  for t in select unnest(array[
    'finance_ai_conversations','finance_ai_messages',
    'finance_voice_logs','finance_actions'
  ])
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

notify pgrst, 'reload schema';
