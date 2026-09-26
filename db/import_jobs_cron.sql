-- Disparador de la cola de importación: pg_cron cada minuto.
--
-- ⚠️ Este archivo va APARTE de import_jobs.sql porque necesita un secreto y se
-- aplica una sola vez, a mano.
--
-- Por qué pg_cron y no Vercel Cron: en plan Hobby los cron de Vercel corren UNA
-- VEZ AL DÍA, y una expresión `*/1 * * * *` hace fallar el deploy entero. Atar
-- esta función al plan Pro por un disparador no vale la pena cuando el Postgres
-- que ya es dueño del dato puede hacerlo con granularidad de minutos.
--
-- Si algún día confirman Pro, cambiar el disparador a Vercel Cron son cuatro
-- líneas en vercel.json y un `cron.unschedule` acá.
--
-- ANTES DE CORRER ESTO:
--   1. Poner IMPORT_WORKER_SECRET en las variables de entorno de Vercel
--      (Settings → Environment Variables, Production).
--   2. Guardar EL MISMO valor en Vault:
--        select vault.create_secret('<el valor>', 'import_worker_secret');
--   3. Tener /api/import-jobs desplegado en producción.
--
-- El secreto NO va escrito acá. `scripts/run_sql.mjs` ya tiene la contraseña de
-- Postgres en texto plano en el repo; no repetimos el patrón.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Re-ejecutable: si ya existía la tarea, se reemplaza.
select cron.unschedule('import_jobs_tick')
  where exists (select 1 from cron.job where jobname = 'import_jobs_tick');

select cron.schedule('import_jobs_tick', '* * * * *', $cron$
  select net.http_post(
    url     := 'https://portal.josehuila.com/api/import-jobs?action=tick',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-worker-secret',
                 (select decrypted_secret from vault.decrypted_secrets
                   where name = 'import_worker_secret')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 250000
  )
  -- Con la cola vacía no se dispara nada: cero invocaciones ociosas de Vercel,
  -- cero costo en reposo. Es la diferencia entre 43.200 llamadas al mes y unas
  -- pocas cuando de verdad hay trabajo.
  where exists (
    select 1 from public.import_jobs
     where status in ('queued','scraping','importing','classifying')
  );
$cron$);

-- Para ver si corre:
--   select jobname, schedule, active from cron.job where jobname = 'import_jobs_tick';
--   select status, return_message, start_time from cron.job_run_details
--    where jobid = (select jobid from cron.job where jobname='import_jobs_tick')
--    order by start_time desc limit 10;
