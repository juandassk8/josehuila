-- North Star: planning estratégico personal de Jose. Solo admin lo ve.
--
-- Tres tablas que se anidan: año → mes → semana.
--   north_star_year   → 1 row por año (goal anual, revenue streams, reach targets)
--   north_star_months → 1 row por mes (3 hitos: financiero, operativo, producto)
--   north_star_weeks  → 1 row por semana ISO (3 focos + tareas + bitácora + retro)

create table if not exists north_star_year (
  id uuid primary key default gen_random_uuid(),
  year int not null unique,
  goal_revenue_usd numeric not null default 0,
  revenue_streams jsonb not null default '[]'::jsonb,
  reach_targets jsonb not null default '{}'::jsonb,
  content_strategy text,
  team_roster jsonb not null default '[]'::jsonb,
  notes text,
  updated_at timestamptz not null default now()
);

create table if not exists north_star_months (
  id uuid primary key default gen_random_uuid(),
  year int not null,
  month int not null check (month between 1 and 12),
  title text,
  hito_financiero text,
  hito_financiero_target numeric default 0,
  hito_financiero_actual numeric default 0,
  hito_operativo text,
  hito_operativo_videos_target int default 0,
  hito_operativo_videos_actual int default 0,
  hito_operativo_views_target bigint default 0,
  hito_operativo_views_actual bigint default 0,
  hito_producto text,
  hito_producto_clientes_target int default 0,
  hito_producto_clientes_actual int default 0,
  hito_producto_facturacion_target numeric default 0,
  hito_producto_facturacion_actual numeric default 0,
  notes text,
  updated_at timestamptz not null default now(),
  unique (year, month)
);

create table if not exists north_star_weeks (
  id uuid primary key default gen_random_uuid(),
  year int not null,
  week_iso int not null check (week_iso between 1 and 53),
  month int,
  title text,
  focos jsonb not null default '[]'::jsonb,
  action_items jsonb not null default '[]'::jsonb,
  daily_pulse jsonb not null default '{}'::jsonb,
  retro jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (year, week_iso)
);

create index if not exists north_star_months_year_idx on north_star_months(year, month desc);
create index if not exists north_star_weeks_year_idx on north_star_weeks(year, week_iso desc);

-- Seed del año 2026 con los datos del North Star PDF de Jose.
insert into north_star_year (year, goal_revenue_usd, revenue_streams, reach_targets, content_strategy, team_roster, notes)
values (
  2026,
  120000,
  '[
    {"name":"High-Ticket Consultancy","offer":"Arquitectura InForce OS para grandes ligas","volume":"6 clientes x $7K","target_usd":43000},
    {"name":"Performance Agency","offer":"Escalado a +300K (2.7% de facturación)","volume":"6 clientes x $7K","target_usd":43000},
    {"name":"The Launchpad","offer":"El sistema para superar los 40K en facturación","volume":"30 ventas x $1.2K","target_usd":34000}
  ]'::jsonb,
  '{"instagram":500000,"tiktok":1000000,"youtube":200000,"email":100000}'::jsonb,
  '21 piezas semanales · 80% autoridad técnica (Shopify, Ads, Tesis de escala) · 20% inspiración y skin in the game.',
  '[
    {"role":"Estratega de Contenido","scope":"Marca personal — guioniza, busca referentes, gestiona calendario"},
    {"role":"Jul","scope":"Editor 1 — vara de calidad en marca personal"},
    {"role":"Nath","scope":"Project Manager & CopyWriter — cumplimiento y presión sobre equipos cliente"},
    {"role":"CopyWriter","scope":"Apoyo a Nath en guiones de empresas"},
    {"role":"Deison","scope":"Performance Auditor — Looms de Tesis y ROAS"},
    {"role":"Editores (x2)","scope":"Ejecución masiva de creativos para 6 clientes élite"},
    {"role":"Diseñadores (x1)","scope":"Ejecución masiva de creativos para 6 clientes élite"}
  ]'::jsonb,
  null
)
on conflict (year) do nothing;

-- Seed Mayo 2026 con los datos del Planificador Semanal S1.
insert into north_star_months (
  year, month, title,
  hito_financiero, hito_financiero_target,
  hito_operativo, hito_operativo_videos_target, hito_operativo_views_target,
  hito_producto, hito_producto_clientes_target, hito_producto_facturacion_target
)
values (
  2026, 5, 'Marca Personal y Agencia',
  'Facturar los primeros $15K en nuevos contratos de empresas E-Commerce', 15000,
  'Tener 3 videos por día toda la semana sin fallo', 90, 9000000,
  'Clientes de agencia en $1.200M ventas mensual', 3, 1200000000
)
on conflict (year, month) do nothing;
