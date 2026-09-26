-- Equipo: agregar soft-delete + permisos finos por miembro.
--
-- active: false → no aparece en listas, canAccessView retorna false en todo.
-- access_overrides: jsonb mapa viewKey → bool. true=permitir, false=denegar,
--   ausente=usa el default del rol.
--
-- SAFE: idempotente.

alter table public.team_members
  add column if not exists active boolean not null default true;

create index if not exists team_members_active_idx
  on public.team_members(active);

alter table public.team_members
  add column if not exists access_overrides jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';
