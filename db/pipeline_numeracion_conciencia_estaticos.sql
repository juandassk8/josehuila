-- =====================================================================
-- db/pipeline_numeracion_conciencia_estaticos.sql
--
-- Tres cosas que van juntas porque tocan la misma tabla (pipeline_slots):
--
--   1. NUMERACIÓN CORRELATIVA POR EMPRESA. Hasta hoy el número del creativo se
--      sacaba con max(num)+1 DENTRO DEL BRIEF, así que el brief 4 y el brief 5
--      tenían los dos un #001. Con dos "#001" distintos el nombre del anuncio
--      deja de identificar nada: ni en Facebook, ni en Drive, ni en el link de
--      guiones. Pasa a ser un contador por empresa (`pipeline_counters`) que se
--      incrementa de forma atómica, así dos personas creando slots a la vez
--      nunca sacan el mismo número.
--
--   2. NIVEL DE CONCIENCIA (TOFU/MOFU/BOFU) como campo propio. Antes vivía
--      escrito adentro del concepto ("UGC MOFU" a mano) o directamente no
--      existía. Como campo se puede filtrar, contar y componer la etiqueta al
--      vuelo — y si mañana cambia el concepto, la etiqueta se actualiza sola.
--
--   3. IMÁGENES DE REFERENCIA DEL ESTÁTICO. Un slot estático no tenía dónde
--      subir la imagen, así que los estáticos que ya existen (los de Salgar)
--      viven fuera de la plataforma.
--
-- Idempotente. Correr en el SQL Editor de Supabase como postgres.
-- =====================================================================

-- ── 1. Columnas nuevas en pipeline_slots ─────────────────────────────
alter table public.pipeline_slots
  add column if not exists nivel_conciencia text,
  add column if not exists imagenes jsonb not null default '[]'::jsonb;

-- Valores cerrados: TOFU / MOFU / BOFU, o vacío. Es opcional a propósito —
-- exigirlo para crear el slot frenaría la planeación en seco, y los creativos
-- viejos no tienen nivel que declarar.
do $$ begin
  alter table public.pipeline_slots
    add constraint pipeline_slots_nivel_conciencia_chk
    check (nivel_conciencia is null or nivel_conciencia in ('tofu', 'mofu', 'bofu'));
exception when duplicate_object then null; end $$;

create index if not exists pipeline_slots_nivel_idx
  on public.pipeline_slots(nivel_conciencia) where nivel_conciencia is not null;

-- ── 2. Contador de creativos por empresa ─────────────────────────────
-- Una fila por empresa. `last_num` es el último número REPARTIDO, no la
-- cantidad de slots vivos: borrar un creativo NO devuelve su número al pozo.
-- Un número quemado es un número que nunca vuelve a nombrar otra cosa, y eso
-- es justamente lo que hace que el nombre sirva para rastrear.
create table if not exists public.pipeline_counters (
  company_id text primary key,
  last_num   integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.pipeline_counters enable row level security;
drop policy if exists "pipeline_counters tenant" on public.pipeline_counters;
create policy "pipeline_counters tenant" on public.pipeline_counters for all to authenticated
  using ( public.is_team_admin() or company_id in (select public.accessible_company_ids()) )
  with check ( public.is_team_admin() or company_id in (select public.accessible_company_ids()) );

-- Reserva un bloque de `p_count` números y devuelve el PRIMERO del bloque.
-- Todo pasa en un solo INSERT ... ON CONFLICT DO UPDATE, que Postgres resuelve
-- tomando el lock de la fila: dos sesiones pidiendo a la vez se serializan y
-- ninguna ve el mismo número que la otra. Por eso el contador es una fila y no
-- un `max(num)+1` leído desde el cliente, que es una carrera con dos pasos.
create or replace function public.next_pipeline_num(p_company_id text, p_count integer default 1)
returns integer
language plpgsql
as $$
declare ultimo integer;
begin
  if p_count is null or p_count < 1 then p_count := 1; end if;

  insert into public.pipeline_counters as c (company_id, last_num)
  values (p_company_id, p_count)
  on conflict (company_id) do update
    set last_num = c.last_num + p_count, updated_at = now()
  returning c.last_num into ultimo;

  return ultimo - p_count + 1;
end $$;

grant execute on function public.next_pipeline_num(text, integer) to authenticated;

-- ── 3. Backfill: renumerar el histórico y dejar el contador al día ───
-- Los números que ya existen están duplicados entre briefs. Se recorre el
-- histórico completo en el orden real en que se produjo —brief 1 → brief N y,
-- dentro de cada brief, por fecha de creación— y se reasigna 1..N por empresa.
--
-- El `order by` desempata con el id para que dos corridas den EXACTAMENTE la
-- misma secuencia: si no, dos slots creados en el mismo milisegundo podrían
-- intercambiarse y un creativo cambiaría de número al re-correr el script.
--
-- Los slots sin brief (no debería haber, pero la FK lo permite) van al final,
-- que es donde menos molestan.
do $$
declare cid text; sl record; n integer;
begin
  for cid in (select distinct company_id from public.pipeline_slots where company_id is not null) loop
    n := 0;
    for sl in (
      select s.id
      from public.pipeline_slots s
      left join public.pipeline_briefs b on b.id = s.brief_id
      where s.company_id = cid
      order by b.created_at asc nulls last, b.id asc nulls last, s.created_at asc, s.id asc
    ) loop
      n := n + 1;
      update public.pipeline_slots set num = n where id = sl.id and num is distinct from n;
    end loop;

    -- El contador queda en el último número usado. `greatest` para que
    -- re-correr el script nunca lo haga retroceder por debajo de números que
    -- ya se repartieron después de la primera corrida.
    insert into public.pipeline_counters as c (company_id, last_num)
    values (cid, n)
    on conflict (company_id) do update
      set last_num = greatest(c.last_num, excluded.last_num), updated_at = now();
  end loop;
end $$;

-- ── 4. PostgREST cachea el esquema: sin esto no ve lo nuevo ──────────
notify pgrst, 'reload schema';
