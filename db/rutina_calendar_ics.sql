-- Google Calendar en Mi rutina: dirección iCal privada (solo lectura) de cada miembro. Idempotente.
alter table public.routine_settings add column if not exists calendar_ics_url text;
notify pgrst, 'reload schema';
