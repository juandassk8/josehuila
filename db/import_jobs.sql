-- Cola de trabajos de la Bandeja — que sobrevivan a navegar y a cerrar el navegador.
--
-- Hoy el import de una marca vive entero en el navegador: `TeamApp` monta las
-- secciones con una cadena de if/else, así que al cambiar de vista React
-- desmonta `BandejaPage` y se lleva la cola, la barra de progreso y las promesas
-- en vuelo. Jose se salía de la Bandeja y el scraping simplemente dejaba de
-- avanzar, sin decir nada.
--
-- Esta tabla es el estado durable de cada trabajo, y un worker sin sesión
-- (service_role) lo avanza tick a tick. El trabajo NO cabe en una invocación: el
-- scrape es una llamada de hasta 230s y después vienen N clasificaciones de
-- hasta 300s cada una. Por eso cada tick avanza lo que le entra en su
-- presupuesto y guarda dónde quedó.
--
-- El precedente en este repo es el cronómetro de tiempo: es el único proceso
-- largo que sobrevive a todo, y sobrevive porque su estado está en la base.
--
-- Team-only. RLS espeja la Sección H de rls_hardening_v1.sql. Idempotente.
-- Correr en el SQL Editor de Supabase como postgres.

create table if not exists public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  -- El orden de la cola sale de acá y no de `queued_at`. Dos jobs encolados en
  -- la misma transacción comparten timestamp al microsegundo, y ahí un
  -- `order by queued_at limit 1` elige cualquiera de los dos: probándolo, la
  -- cola sacó la segunda marca antes que la primera.
  seq bigserial not null,
  created_by uuid,                                  -- auth.uid() de quien encoló

  -- Qué clase de trabajo. No es solo "traer una marca": las subidas de archivo,
  -- los links de Drive y el enriquecido masivo sufren el mismo desmonte.
  kind text not null default 'brand'
    check (kind in ('brand','file','drive','enrich')),

  -- Entrada (lo que se pidió)
  raw_input text not null,                          -- lo que se pegó, para mostrarlo tal cual
  brand text,                                       -- nombre de marca (null si vino pageId)
  page_id text,                                     -- view_all_page_id del link de la Ad Library
  source_ref text,                                  -- ruta en Storage (file) o URL de Drive
  top_n int not null default 100,
  scrape_count int not null default 300,
  media_only text check (media_only in ('video','static')),   -- null = todos
  incluir_copias boolean not null default false,
  company_id text,                                  -- companies.id es TEXT legacy, sin FK
  pipeline_type text not null default 'ads',

  -- Máquina de estados
  status text not null default 'queued'
    check (status in ('queued','scraping','importing','classifying','done','failed','canceled')),
  phase_detail text,                                -- mensaje humano del tick actual
  attempts int not null default 0,                  -- ticks caídos recuperados
  scrape_attempts int not null default 0,           -- reintentos de Apify con count degradado

  -- Progreso. Son contadores chicos a propósito: es lo único que viaja por
  -- realtime, y la fila se difunde una vez por cada anuncio procesado.
  brand_resolved text,                              -- page_name real que devolvió Meta
  found_ads int not null default 0,                 -- lo que Meta devolvió
  total_ads int not null default 0,                 -- lo que entró a la bandeja
  skipped_ads int not null default 0,
  done_ads int not null default 0,
  failed_ads int not null default 0,
  needs_file_ads int not null default 0,

  error text,
  warnings jsonb not null default '[]'::jsonb,

  -- Claim atómico. `lease_until` es lo que permite detectar un tick que se murió
  -- a mitad: al vencer, el job vuelve a estar disponible.
  locked_by text,
  locked_at timestamptz,
  lease_until timestamptz,

  queued_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- El payload crudo de Apify va aparte y FUERA de realtime: 300 anuncios en jsonb
-- exceden el límite de tamaño de mensaje de Realtime, y la fila del job se
-- retransmite decenas de veces mientras avanza el análisis.
create table if not exists public.import_job_ads (
  job_id uuid primary key references public.import_jobs(id) on delete cascade,
  ads jsonb not null default '[]'::jsonb,
  scraped_at timestamptz not null default now()
);

-- Vínculo bandeja ↔ job. La fuente de verdad de "qué falta clasificar" es esta
-- columna, no un array guardado en el job: un array se corrompe si un tick muere
-- a mitad, una consulta no.
-- Para bases que ya tenían la tabla sin `seq`.
alter table public.import_jobs add column if not exists seq bigserial;

alter table public.reference_inbox add column if not exists import_job_id uuid;
create index if not exists reference_inbox_import_job_idx
  on public.reference_inbox(import_job_id) where import_job_id is not null;

-- Cola: el claim busca el más viejo pendiente sin lease viva.
create index if not exists import_jobs_queue_idx
  on public.import_jobs(seq)
  where status in ('queued','scraping','importing','classifying');
create index if not exists import_jobs_recent_idx
  on public.import_jobs(created_at desc);

-- Una marca activa a la vez: encolar Nike dos veces por error paga Apify dos veces.
create unique index if not exists import_jobs_active_target_idx
  on public.import_jobs (coalesce(page_id, lower(brand)))
  where kind = 'brand' and status in ('queued','scraping','importing','classifying');

create or replace function public.import_jobs_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists import_jobs_set_updated_at on public.import_jobs;
create trigger import_jobs_set_updated_at
  before update on public.import_jobs
  for each row execute function public.import_jobs_touch_updated_at();

-- RLS: team-only. Espeja la Sección H de rls_hardening_v1.sql.
alter table public.import_jobs enable row level security;
drop policy if exists "import_jobs team only" on public.import_jobs;
create policy "import_jobs team only" on public.import_jobs
  for all to authenticated
  using (public.is_team_admin())
  with check (public.is_team_admin());

alter table public.import_job_ads enable row level security;
drop policy if exists "import_job_ads team only" on public.import_job_ads;
create policy "import_job_ads team only" on public.import_job_ads
  for all to authenticated
  using (public.is_team_admin())
  with check (public.is_team_admin());

-- Realtime SOLO para import_jobs. El widget de progreso se suscribe acá.
do $$ begin
  alter publication supabase_realtime add table public.import_jobs;
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────────
-- Claim atómico
--
-- Va a haber dos disparadores a la vez: el cron cada minuto y el "kick" que
-- manda el navegador al encolar. Sin esto, los dos toman el mismo job y lo
-- procesan en paralelo. `for update skip locked` cierra la ventana entre leer y
-- escribir: uno se lleva la fila, el otro recibe cero y se va.
--
-- La invariante que importa: el lease (360s) es MAYOR que el maxDuration de la
-- función (300s). Así, un tick lento pero vivo no puede perder su lease y ver
-- cómo otro empieza a clasificar los mismos anuncios.
create or replace function public.claim_import_job(
  p_worker text,
  p_lease_secs int default 360,
  p_max_running int default 1
)
returns setof public.import_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_running int;
begin
  -- Un tick que se murió (deploy a mitad, OOM, timeout duro) dejó su lease viva
  -- y nadie la limpia. Al vencer, el job vuelve a la cola y reanuda desde la
  -- fase donde iba — no desde cero, porque cada fase es idempotente.
  update public.import_jobs
     set locked_by = null, locked_at = null, lease_until = null,
         attempts = attempts + 1,
         phase_detail = 'reanudando (el tick anterior no terminó)'
   where lease_until is not null and lease_until < now();

  -- Si ocho ticks seguidos se cayeron, no es mala suerte: algo está roto.
  update public.import_jobs
     set status = 'failed', finished_at = now(),
         error = coalesce(error, 'el worker se cayó 8 veces seguidas')
   where status in ('scraping','importing','classifying') and attempts > 8;

  -- Tope de trabajos en paralelo = leases vivas. Por defecto 1: las marcas se
  -- procesan en orden de llegada, que es lo pedido, y además no revienta los
  -- límites de Apify ni de Anthropic.
  select count(*) into v_running
    from public.import_jobs where lease_until is not null and lease_until > now();
  if v_running >= p_max_running then return; end if;

  return query
  update public.import_jobs j
     set status      = case when j.status = 'queued'
                            then (case when j.kind = 'brand' then 'scraping' else 'classifying' end)
                            else j.status end,
         locked_by   = p_worker,
         locked_at   = now(),
         lease_until = now() + make_interval(secs => p_lease_secs),
         started_at  = coalesce(j.started_at, now())
   where j.id = (
     select id from public.import_jobs
      where status in ('queued','scraping','importing','classifying')
        and (lease_until is null or lease_until < now())
      order by seq
      limit 1
      for update skip locked)
  returning j.*;
end;
$$;

-- Solo el worker (service_role) la llama. Nadie más tiene por qué reclamar jobs.
revoke all on function public.claim_import_job(text,int,int) from public, anon, authenticated;

notify pgrst, 'reload schema';
