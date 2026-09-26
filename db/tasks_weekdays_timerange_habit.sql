-- Recurrencia por días de la semana, franja horaria y enlace tarea → hábito. Solo agrega columnas. Idempotente.
alter table public.tasks
  add column if not exists recurrence_days int[],   -- 7 posiciones L..D (1 = toca) cuando recurrence_pattern = 'dias_semana'
  add column if not exists due_time_end text,        -- fin de la franja horaria ("HH:MM")
  add column if not exists habit_key text;           -- al completarla marca este hábito y su bloque de rutina
notify pgrst, 'reload schema';
