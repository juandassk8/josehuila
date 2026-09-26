-- Fase D — limpieza final: eliminar las columnas de PIN en texto plano.
-- Ya no se usan (login retirado a email+contraseña real) y ya no eran anon-legibles
-- (RLS las bloqueaba), pero se eliminan como defense-in-depth para que ni siquiera
-- existan credenciales en texto plano en la base.
--
-- PRECONDICIÓN: el código ya no lee/escribe estas columnas (deploy 2026-07-14).
-- Idempotente.

alter table public.companies            drop column if exists pin;
alter table public.company_team_members drop column if exists pin;

notify pgrst, 'reload schema';
