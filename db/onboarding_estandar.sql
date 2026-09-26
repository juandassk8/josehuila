-- Pantalla de onboarding del equipo: la calificación del Estándar, punto por punto.
-- Pieza 2 del roadmap (docs/roadmap-onboarding.md). El catálogo de puntos —qué se
-- califica, cómo, qué es un 10 y qué es un 1— vive en src/estandar/catalogo.json,
-- sacado de docs/estandar-inforce.md. Acá solo se guarda lo que el equipo califica.
--
-- Una fila por (marca, punto). José, Nath y Deison escriben sobre el MISMO perfil:
-- el que entra después ya llega con el contexto de los anteriores.
--
-- Los datos que llenó el cliente en el formulario NO se copian acá: siguen en
-- `brand_profile_data`, etiquetados con `puntos_estandar`, y la pantalla los lee de
-- allá. Esta tabla es solo la mirada del equipo.
--
-- Solo aditivo. Idempotente.

create table if not exists public.standard_scores (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id) on delete cascade,
  -- El punto del Estándar: '3.4', '10.2', 'A.1'. El id manda; si el Estándar
  -- renumera, se migra el id, no el contenido.
  punto text not null,
  -- La calificación, según cómo se califica ese punto:
  --   { "nota": 7 }                      1 a 10
  --   { "si": true }                     Sí / No
  --   { "distribucion": [10,30,40,15,5] } conciencia (1.7)
  --   null                               solo descripción, o todavía sin calificar
  calificacion jsonb,
  -- Lo que le da sentido a la nota: lo que el cliente lee en el informe, y lo que
  -- después la IA llena con el transcript de la llamada.
  descripcion text not null default '',
  -- Puntos condicionales que no aplican a esta marca (se ocultan, no quedan en blanco).
  no_aplica boolean not null default false,
  -- 'equipo' lo escribió una persona · 'ia' lo propuso la IA y nadie lo ha revisado.
  origen text not null default 'equipo' check (origen in ('equipo', 'ia')),
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, punto)
);

create index if not exists standard_scores_company_idx on public.standard_scores(company_id);

alter table public.standard_scores enable row level security;

-- Solo el equipo, por ahora. La marca va a leer su diagnóstico cuando exista el
-- informe (pieza 3); abrirle antes las notas crudas, a medio calificar, no le sirve.
drop policy if exists "standard scores equipo" on public.standard_scores;
create policy "standard scores equipo" on public.standard_scores
  for all to authenticated
  using (public.is_team_admin())
  with check (public.is_team_admin());

notify pgrst, 'reload schema';
