-- =========================================================
-- INFORCE CENTRAL — Initial seed
-- RUN ORDER:
--   1. Supabase Dashboard → Authentication → Add user x4
--      Create users manually for Jose, Deison, Nath, Jul.
--      Check "Auto Confirm User" for each. Pick passwords you'll remember.
--   2. Replace the <EMAIL> placeholders below with the real emails.
--   3. Run this file in the SQL editor.
-- =========================================================

-- STEP A — team_members linked to auth.users by email --------
insert into public.team_members (id, name, role, email, color)
select u.id, 'Jose',   'admin',  u.email, '#378ADD'
from auth.users u
where u.email = '<JOSE_EMAIL>'
on conflict (id) do nothing;

insert into public.team_members (id, name, role, email, color)
select u.id, 'Deison', 'member', u.email, '#1DB97A'
from auth.users u
where u.email = '<DEISON_EMAIL>'
on conflict (id) do nothing;

insert into public.team_members (id, name, role, email, color)
select u.id, 'Nath',   'member', u.email, '#F5A623'
from auth.users u
where u.email = '<NATH_EMAIL>'
on conflict (id) do nothing;

insert into public.team_members (id, name, role, email, color)
select u.id, 'Jul',    'editor', u.email, '#8B5CF6'
from auth.users u
where u.email = '<JUL_EMAIL>'
on conflict (id) do nothing;

-- STEP B — shared spaces -------------------------------------
insert into public.spaces (name, icon, visibility, sort_order, color)
values
  ('Mentoría',       '🎓', 'shared', 1, '#378ADD'),
  ('Marca Personal', '✨', 'shared', 2, '#8B5CF6')
on conflict do nothing;

-- STEP C — private "Personal" space per team member ----------
insert into public.spaces (name, icon, visibility, owner_id, sort_order, color)
select 'Personal', '🏠', 'private', tm.id, 0, tm.color
from public.team_members tm
where not exists (
  select 1 from public.spaces s
  where s.owner_id = tm.id and s.visibility = 'private'
);

-- Verify
select id, name, role, email, color from public.team_members order by name;
select id, name, visibility, owner_id from public.spaces order by sort_order;
