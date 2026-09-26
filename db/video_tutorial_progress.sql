-- Agrega tracking de los tutoriales en video al onboarding por usuario.
-- Las 3 columnas extienden user_onboarding_progress sin romper nada.
-- Idempotente.

alter table public.user_onboarding_progress
  add column if not exists video_tutorial_completed_at timestamptz,
  add column if not exists video_tutorial_skipped_at   timestamptz,
  add column if not exists video_tutorial_step_index   int not null default 0;

-- Refresca cache de PostgREST para que el schema nuevo esté disponible.
notify pgrst, 'reload schema';
