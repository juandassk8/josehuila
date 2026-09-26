# Inforce Central — Team module DB setup

Schema files for the team/operations module. These are **additive**: they never touch `companies` or `reports`.

## Order of operations

1. Open Supabase Dashboard → **SQL editor**.
2. Paste and run `team_schema.sql`. Creates `team_members`, `spaces`, `tasks`, `task_assignees`, enum types, RLS policies, realtime publication, triggers.
3. Go to **Authentication → Users → Add user**. Create 4 users:
   - Jose (admin) — `<your email>` + password, check "Auto Confirm User"
   - Deison (member)
   - Nath (member)
   - Jul (editor)
4. Open `team_seed.sql`, replace the 4 `<EMAIL>` placeholders with the emails you just used, then run it.
5. Go to **Authentication → Settings**. Set **JWT expiry** to 604800 (1 week) so sessions last longer between refreshes.
6. Open `portal.inforceconsulting.com/?zona=equipo` (or `http://localhost:5173/?zona=equipo` in dev) and log in.

## If something goes wrong

- To wipe the team module and start over:
  ```sql
  drop table if exists public.task_assignees cascade;
  drop table if exists public.tasks cascade;
  drop table if exists public.spaces cascade;
  drop table if exists public.team_members cascade;
  drop type if exists task_status;
  drop type if exists task_priority;
  ```
  This does NOT affect `companies` or `reports`.

- If you can't log in: check that the `team_members.id` matches `auth.users.id` for your email. The seed joins on email, so typos break it.
