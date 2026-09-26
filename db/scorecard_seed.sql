-- =========================================================
-- INFORCE CENTRAL — Scorecard seed para Nat y Deison
-- Reemplaza los emails si son distintos en tu team_seed.sql.
-- Idempotente: si ya existen los KPIs (match por member_id + label), no duplica.
-- =========================================================

-- Ajusta estos emails al valor real en team_members
do $$
declare
  v_nat_id uuid;
  v_deison_id uuid;
begin
  select id into v_nat_id from public.team_members
    where email ilike 'nat%' or name ilike 'nat%' limit 1;
  select id into v_deison_id from public.team_members
    where email ilike 'deison%' or email ilike 'deyson%'
       or name ilike 'deison%' or name ilike 'deyson%' limit 1;

  -- Nat: 4 KPIs
  if v_nat_id is not null then
    insert into public.scorecard_kpis (member_id, category, label, sort_order)
    select v_nat_id, 'VELOCIDAD', 'SLA de Feedback < 2h — contenido subido por clientes recibe Loom de corrección en menos de 2 horas', 1
    where not exists (
      select 1 from public.scorecard_kpis
       where member_id = v_nat_id and category = 'VELOCIDAD' and sort_order = 1
    );

    insert into public.scorecard_kpis (member_id, category, label, sort_order)
    select v_nat_id, 'CALIDAD', 'Filtro "La Vara" — el 100% de los guiones y videos aprobados cumplen estrictamente con el Estándar de Calidad Inforce', 2
    where not exists (
      select 1 from public.scorecard_kpis
       where member_id = v_nat_id and category = 'CALIDAD' and sort_order = 2
    );

    insert into public.scorecard_kpis (member_id, category, label, sort_order)
    select v_nat_id, 'PRESION', 'Gestión de Cartera — ¿Se contactó a TODOS los clientes que están en estado Amarillo o Rojo en el Master Dashboard?', 3
    where not exists (
      select 1 from public.scorecard_kpis
       where member_id = v_nat_id and category = 'PRESION' and sort_order = 3
    );

    insert into public.scorecard_kpis (member_id, category, label, sort_order)
    select v_nat_id, 'DATA', 'Actualización de Tablero — el Master Tracking Sheet quedó actualizada al 100% con los últimos avances y links de cada cliente', 4
    where not exists (
      select 1 from public.scorecard_kpis
       where member_id = v_nat_id and category = 'DATA' and sort_order = 4
    );
  end if;

  -- Deison: 4 KPIs
  if v_deison_id is not null then
    insert into public.scorecard_kpis (member_id, category, label, sort_order)
    select v_deison_id, 'VELOCIDAD', 'Reporte 10 AM enviado a tiempo a todos los clientes activos', 1
    where not exists (
      select 1 from public.scorecard_kpis
       where member_id = v_deison_id and category = 'VELOCIDAD' and sort_order = 1
    );

    insert into public.scorecard_kpis (member_id, category, label, sort_order)
    select v_deison_id, 'CALIDAD', 'Reporte 3 PM enviado a tiempo con análisis y recomendaciones claras', 2
    where not exists (
      select 1 from public.scorecard_kpis
       where member_id = v_deison_id and category = 'CALIDAD' and sort_order = 2
    );

    insert into public.scorecard_kpis (member_id, category, label, sort_order)
    select v_deison_id, 'PRESION', 'SLA de Soporte — dudas técnicas de clientes resueltas en menos de 2 horas', 3
    where not exists (
      select 1 from public.scorecard_kpis
       where member_id = v_deison_id and category = 'PRESION' and sort_order = 3
    );

    insert into public.scorecard_kpis (member_id, category, label, sort_order)
    select v_deison_id, 'DATA', 'Agudeza — análisis de calidad alta, observaciones relevantes y accionables en cada reporte', 4
    where not exists (
      select 1 from public.scorecard_kpis
       where member_id = v_deison_id and category = 'DATA' and sort_order = 4
    );
  end if;
end $$;
