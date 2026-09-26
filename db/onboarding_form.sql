-- Formulario de onboarding de clientes (`/inicio/<token>`).
-- Spec: docs/formulario-onboarding.md
--
-- Dos tablas, y la separación es el punto:
--
--   onboarding_forms    → el LINK y su estado. Una fila por link generado.
--   brand_profile_data  → el PERFIL DE LA MARCA. Una fila por dato, no por
--                         pregunta. De acá leen después la pantalla de onboarding
--                         del equipo y el diagnóstico.
--
-- El formulario se abre SIN cuenta, así que el token es la única llave. `anon` no
-- lee ninguna de las dos tablas: la página pública entra por
-- `api/onboarding-form.js`, que usa service_role y devuelve solo lo de ese token.
--
-- A propósito NO hay columna de "pantalla actual": dónde quedó el cliente se
-- calcula de las respuestas (src/formulario/flujo.js). Un índice guardado se
-- daña apenas cambia una rama.
--
-- Solo aditivo. Idempotente.

create table if not exists public.onboarding_forms (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id) on delete cascade,
  token text not null unique,
  status text not null default 'pendiente'
    check (status in ('pendiente', 'en_curso', 'completo', 'salida_dropshipping')),
  -- El aviso barato para el equipo: el badge de Empresas se pone rojo con esto.
  -- Se calcula al finalizar (CPA por encima del máximo, o tres o más "no lo sé").
  alerta boolean not null default false,
  alerta_motivos text[] not null default '{}',
  -- Los usuarios que se les crearon a los socios de la 1.6 al finalizar. Sin
  -- contraseñas: esas no se guardan en ningún lado; el equipo se las genera desde
  -- el modal de Empresas. [{ nombre, usuario, correo_contacto, auth_user_id }]
  accesos_socios jsonb not null default '[]'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  last_activity_at timestamptz,
  completed_at timestamptz,
  revoked_at timestamptz
);

alter table public.onboarding_forms
  add column if not exists accesos_socios jsonb not null default '[]'::jsonb;

create index if not exists onboarding_forms_company_idx
  on public.onboarding_forms(company_id, created_at desc);

alter table public.onboarding_forms enable row level security;

-- Solo el equipo. El cliente nunca lee esta tabla: lleva el token, y un miembro
-- de la empresa con el token en la mano podría reabrir el formulario de su socio.
drop policy if exists "onboarding forms equipo" on public.onboarding_forms;
create policy "onboarding forms equipo" on public.onboarding_forms
  for all to authenticated
  using (public.is_team_admin())
  with check (public.is_team_admin());


create table if not exists public.brand_profile_data (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id) on delete cascade,
  -- La clave estable del dato (`margen_por_producto`, `cpa_maximo`…). Nunca
  -- "pregunta 9": el formulario puede reordenarse y esto no se entera.
  campo text not null,
  -- De qué pantalla del formulario salió (`2.5`). Null en los calculados.
  pantalla text,
  -- Los puntos del Estándar que este dato alimenta (`{2.1,2.2}`), `perfil`, o los
  -- x.0 que el Estándar llama datos de base. El mapa vive en flujo.js; si el
  -- Estándar cambia se corrige allá y se re-etiqueta, sin tocar `campo`.
  puntos_estandar text[] not null default '{}',
  valor jsonb,
  no_lo_se boolean not null default false,
  origen text not null default 'formulario'
    check (origen in ('formulario', 'calculado', 'equipo')),
  -- No se rechaza pero se mira en la llamada (p. ej. CPA mayor que el ticket).
  para_revisar boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, campo)
);

create index if not exists brand_profile_data_puntos_idx
  on public.brand_profile_data using gin (puntos_estandar);

alter table public.brand_profile_data enable row level security;

-- El equipo lee y escribe. La marca LEE lo suyo (es su perfil); escribir, por
-- ahora, solo a través del formulario, que entra con service_role.
drop policy if exists "brand profile equipo" on public.brand_profile_data;
create policy "brand profile equipo" on public.brand_profile_data
  for all to authenticated
  using (public.is_team_admin())
  with check (public.is_team_admin());

drop policy if exists "brand profile lectura marca" on public.brand_profile_data;
create policy "brand profile lectura marca" on public.brand_profile_data
  for select to authenticated
  using (company_id in (select public.accessible_company_ids()));

notify pgrst, 'reload schema';
