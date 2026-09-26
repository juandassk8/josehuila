-- Taxonomía del banco: un vocabulario cerrado por eje.
--
-- POR QUÉ EXISTE
--
-- Las etiquetas del banco derivaron hasta volverse inservibles. Medido: 56
-- subnichos donde "Gafas" y "Óptica" son lo mismo, "Lipedema" y "Lipodema"
-- difieren en un error de tipeo, y la salud digestiva canina existe en CINCO
-- versiones. Los nichos tienen "calzado" y "Calzado" como valores distintos.
--
-- El mecanismo de la deriva: la IA propone un valor libre, se guarda, y en la
-- siguiente clasificación entra al vocabulario que se le pasa como ejemplo. Se
-- legitima solo por repetirse. Sin una lista cerrada contra la cual converger,
-- no hay nada que lo detenga.
--
-- LOS EJES
--
-- Cuatro salen del curso "Despliegue Creativo" (módulo 5, "Los 4 ejes de un
-- anuncio": «Formato, concepto, ángulo y hook. Cuatro perillas independientes»):
--
--   formato   el envase   → video | estático. Nada más. Se DERIVA de media_type,
--                           no se le pregunta a la IA.
--   concepto  la forma    → UGC, testimonial, comparativo… (lista cerrada)
--   variante  el matiz    → pantalla verde, formato noticia (segundo nivel)
--   angulo    el porqué   → el dolor o deseo que ataca. NO es formato ni tema.
--
-- El hook es el quinto eje del curso pero no se etiqueta: es texto libre del
-- anuncio, ya vive en el guion.
--
-- Tres más son del BANCO, no del curso. El curso no define nicho, subnicho ni
-- marca — se buscó en los 97 archivos y no aparecen. Son ejes de BÚSQUEDA
-- ("mostrame referentes de mascotas"), no de metodología, y por eso se guardan
-- aparte y se dicen aparte.
--
-- LA ETAPA NO ES UN EJE DEL CONCEPTO
--
-- El curso agrupa los conceptos por etapa pero nunca dice que un concepto
-- pertenezca a una sola. Los datos reales lo resuelven: UGC aparece en TOFU,
-- MOFU y BOFU. Así que la etapa es del ANUNCIO — igual que en la cartilla del
-- curso, donde `stage` es un campo del creativo. `etapa_tipica` acá es una
-- sugerencia para la IA, no una restricción.
--
-- Idempotente. Correr en el SQL Editor de Supabase.

-- `unaccent` va primero: el normalizador de más abajo la usa, y una función no
-- se puede crear si su cuerpo referencia algo que todavía no existe.
create extension if not exists unaccent;

-- ── Conceptos ────────────────────────────────────────────────────────────────

create table if not exists public.tax_conceptos (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null,
  slug         text not null unique,
  etapa_tipica text check (etapa_tipica in ('tofu','mofu','bofu')),
  formato_tipico text check (formato_tipico in ('video','estatico')),
  descripcion  text,
  del_curso    boolean not null default false,   -- ¿lo desarrolla el curso, o lo agregó el banco?
  activo       boolean not null default true,
  sort_order   int not null default 100,
  created_at   timestamptz not null default now()
);

comment on table public.tax_conceptos is
  'Catálogo cerrado de conceptos. `del_curso` distingue los que el curso desarrolla de los que solo menciona o que agregó el banco.';

-- ── Variantes: el segundo nivel bajo un concepto ─────────────────────────────
--
-- El curso NO tiene subconceptos — se buscó "subconcepto" en los 97 archivos y
-- hay cero ocurrencias, y "Noticia / editorial" es un concepto TOFU hermano de
-- UGC, no un subtipo suyo. Este nivel es una decisión del banco, tomada a
-- sabiendas: Jose distingue "UGC pantalla verde" de "UGC formato noticia" y esa
-- distinción le sirve para buscar.

create table if not exists public.tax_variantes (
  id          uuid primary key default gen_random_uuid(),
  concepto_id uuid not null references public.tax_conceptos(id) on delete cascade,
  nombre      text not null,
  slug        text not null,
  descripcion text,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (concepto_id, slug)
);

-- ── Ángulos ──────────────────────────────────────────────────────────────────
--
-- El curso da CUATRO GRUPOS, no una lista cerrada de valores: dolor/miedo,
-- deseo/aspiración, practicidad, confianza. Los ángulos concretos son del
-- producto ("para piel +40", "el común no se absorbe"), así que la lista es
-- abierta pero cada valor cuelga de un grupo. Eso es lo que impide que
-- "Testimonial" o "Cabello" vuelvan a colarse acá: no pertenecen a ningún grupo.

create table if not exists public.tax_angulos (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  slug       text not null unique,
  grupo      text not null check (grupo in ('dolor','deseo','practicidad','confianza')),
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);

comment on column public.tax_angulos.grupo is
  'Los 4 grandes grupos del módulo 4. Un ángulo que no cabe en ninguno no es un ángulo — suele ser un concepto o un nicho mal puesto.';

-- ── Nichos y subnichos (del banco, no del curso) ─────────────────────────────

create table if not exists public.tax_nichos (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  slug       text not null unique,
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.tax_subnichos (
  id        uuid primary key default gen_random_uuid(),
  nicho_id  uuid not null references public.tax_nichos(id) on delete cascade,
  nombre    text not null,
  slug      text not null,
  activo    boolean not null default true,
  created_at timestamptz not null default now(),
  unique (nicho_id, slug)
);

-- ── Sinónimos: cómo se repara lo que ya está mal ─────────────────────────────
--
-- Cada valor viejo apunta a su canónico. Sirve para dos cosas: migrar lo
-- existente, y absorber lo que llegue mal escrito en el futuro sin crear una
-- categoría nueva. "Lipodema" → "Lipedema" para siempre.

create table if not exists public.tax_sinonimos (
  id         uuid primary key default gen_random_uuid(),
  eje        text not null check (eje in ('concepto','variante','angulo','nicho','subnicho','formato','marca','momento','hook')),
  desde      text not null,          -- lo que se escribió, en minúsculas y sin tildes
  hacia_slug text not null,          -- el canónico
  created_at timestamptz not null default now(),
  unique (eje, desde)
);

comment on table public.tax_sinonimos is
  'Mapa de reparación. `desde` se normaliza (minúsculas, sin tildes) antes de comparar.';

-- ── Normalizador ─────────────────────────────────────────────────────────────
--
-- "calzado" y "Calzado" eran dos nichos distintos. Esto es lo que impide que
-- vuelva a pasar.

create or replace function public.tax_norm(t text)
returns text language sql immutable as $$
  select nullif(trim(regexp_replace(lower(unaccent(coalesce(t,''))), '\s+', ' ', 'g')), '')
$$;

-- ── RLS: mismo criterio que el resto del equipo ──────────────────────────────

alter table public.tax_conceptos  enable row level security;
alter table public.tax_variantes  enable row level security;
alter table public.tax_angulos    enable row level security;
alter table public.tax_nichos     enable row level security;
alter table public.tax_subnichos  enable row level security;
alter table public.tax_sinonimos  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['tax_conceptos','tax_variantes','tax_angulos','tax_nichos','tax_subnichos','tax_sinonimos']
  loop
    -- Lectura: cualquiera autenticado. El vocabulario no es secreto y las
    -- empresas necesitan leerlo para ver sus propias etiquetas.
    execute format('drop policy if exists %I on public.%I', t||'_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t||'_read', t);
    -- Escritura: solo el equipo.
    execute format('drop policy if exists %I on public.%I', t||'_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_team_admin()) with check (public.is_team_admin())', t||'_write', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
