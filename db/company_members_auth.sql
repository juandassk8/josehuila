-- Login de colaboradores. Cada miembro del equipo puede tener un email + pin
-- para loguear al workspace de su empresa. Se reutiliza el flujo de
-- handleClientEmail (App.jsx) y se restringe el nav según sus roles.
-- Idempotente.

alter table public.company_team_members
  add column if not exists email text,
  add column if not exists pin text;

-- Evita emails duplicados dentro de la misma empresa.
create unique index if not exists company_team_members_email_uniq
  on public.company_team_members (company_id, lower(email))
  where email is not null;
