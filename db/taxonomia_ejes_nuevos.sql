-- Cuatro ejes nuevos, decididos con Jose mirando el banco real.
--
-- MOMENTO — por qué esa campaña corre AHORA
--   No existe en el curso. Se agrega porque los datos lo pedían: «Oferta»
--   (2.319) y «Nuevo lanzamiento» (2.148) eran los dos valores más usados del
--   eje ángulo, y ninguno de los dos es un motivo de compra ni una forma de
--   anuncio. Estaban ahí porque no tenían dónde ir.
--
-- CONCIENCIA — a quién le habla el anuncio
--   Los 5 niveles del módulo 1 del curso. Es la columna vertebral de la
--   metodología y el banco no la tenía. Sin esto, un UGC para alguien
--   inconsciente y uno para alguien que ya conoce el producto son "UGC" a secas,
--   aunque no se parezcan en nada.
--
-- IDIOMA — en qué mercado corre
--   292 de 1.997 anuncios están en inglés. Un referente de AG1 sirve por el
--   ángulo pero no por el guion si el cliente vende en Colombia. Se detecta del
--   texto: cero tokens de IA.
--
-- HOOK — los primeros 3 segundos
--   Es la cuarta perilla del curso («decide si el anuncio existe o no») y no se
--   capturaba. OJO: el curso define el hook pero NO da una tipología. Los tipos
--   de abajo son del banco, no del material.
--
-- Idempotente.

-- ── Momento ──────────────────────────────────────────────────────────────────

create table if not exists public.tax_momentos (
  slug text primary key, nombre text not null, descripcion text, sort_order int not null default 100
);

insert into public.tax_momentos (slug, nombre, descripcion, sort_order) values
  ('lanzamiento',   'Lanzamiento',    'Producto, colección o versión nueva.', 10),
  ('promocion',     'Promoción',      'Descuento, oferta, envío gratis, urgencia de precio.', 20),
  ('siempre-activo','Siempre activo', 'Evergreen. No depende de ninguna fecha ni promo.', 30),
  ('fecha-especial','Fecha especial', 'Navidad, Día de la Madre, Black Friday, Hot Sale.', 40)
on conflict (slug) do update set nombre = excluded.nombre, descripcion = excluded.descripcion;

-- ── Nivel de conciencia (módulo 1) ───────────────────────────────────────────
--
-- Los cinco niveles con el nombre EXACTO que usa la cartilla del curso.

create table if not exists public.tax_conciencia (
  nivel int primary key check (nivel between 1 and 5),
  nombre text not null, descripcion text
);

insert into public.tax_conciencia (nivel, nombre, descripcion) values
  (1, 'Inconsciente',            'No sabe que tiene el problema. Hay que mostrárselo antes de vender nada.'),
  (2, 'Consciente del problema', 'Siente el dolor pero no sabe que existe una solución.'),
  (3, 'Consciente de la solución','Sabe que hay soluciones; no conoce la tuya ni por qué es distinta.'),
  (4, 'Consciente del producto', 'Conoce tu producto pero todavía duda.'),
  (5, 'Totalmente consciente',   'Te conoce y confía. Solo le falta el empujón: precio, urgencia, garantía.')
on conflict (nivel) do update set nombre = excluded.nombre, descripcion = excluded.descripcion;

-- ── Tipo de hook ─────────────────────────────────────────────────────────────
--
-- El curso define el hook como eje pero no da tipología. Esta lista es del
-- banco. Si mañana el curso incorpora una, hay que reconciliarlas.

create table if not exists public.tax_hooks (
  slug text primary key, nombre text not null, ejemplo text, sort_order int not null default 100
);

insert into public.tax_hooks (slug, nombre, ejemplo, sort_order) values
  ('pregunta',     'Pregunta',         '«¿Sabías que…?» / «¿Aún no sabes si comprarla?»', 10),
  ('estadistica',  'Dato o estadística','«El 80% de las mujeres…»', 20),
  ('negacion',     'Negación',         '«No compres esto hasta que…»', 30),
  ('demostracion', 'Demostración',     'Arranca mostrando el producto funcionando, sin hablar.', 40),
  ('confesion',    'Confesión',        '«Llevo 6 meses sin comprar botellas de plástico.»', 50),
  ('problema',     'Problema en crudo','Arranca nombrando el dolor sin rodeos.', 60),
  ('resultado',    'Resultado primero','Muestra el después antes de contar nada.', 70),
  ('curiosidad',   'Curiosidad',       '«Esto está cambiando la forma en que…»', 80)
on conflict (slug) do update set nombre = excluded.nombre, ejemplo = excluded.ejemplo;

-- ── Columnas ─────────────────────────────────────────────────────────────────

alter table public.reference_inbox
  add column if not exists momento    text references public.tax_momentos(slug),
  add column if not exists conciencia int  references public.tax_conciencia(nivel),
  add column if not exists hook_tipo  text references public.tax_hooks(slug),
  add column if not exists idioma     text;

alter table public.despliegue_variations
  add column if not exists momento    text references public.tax_momentos(slug),
  add column if not exists conciencia int  references public.tax_conciencia(nivel),
  add column if not exists hook_tipo  text references public.tax_hooks(slug),
  add column if not exists idioma     text;

create index if not exists reference_inbox_momento_idx    on public.reference_inbox(momento)    where momento is not null;
create index if not exists reference_inbox_conciencia_idx on public.reference_inbox(conciencia) where conciencia is not null;

-- ── Detección de idioma ──────────────────────────────────────────────────────
--
-- Sin IA: señales fuertes de cada idioma sobre el texto disponible. Lo que no
-- da una señal clara queda en NULL a propósito — un idioma mal puesto es peor
-- que ninguno, porque hace que el filtro esconda referentes buenos.

create or replace function public.tax_idioma(t text)
returns text language sql immutable as $$
  select case
    when t is null or length(trim(t)) < 12 then null
    -- Caracteres que solo existen en español, o palabras funcionales suyas.
    when t ~ '[ñ¿¡]' or t ~* '\m(que|para|con|los|las|una|este|esta|porque|tu|tus|más|sin)\M' then 'es'
    when t ~* '\m(ção|não|você|também|para você)\M' then 'pt'
    when t ~* '\m(the|your|with|this|that|from|have|our|free shipping|off)\M' then 'en'
    else null
  end
$$;

-- Se corre sobre nombre + transcripción: cuanto más texto, mejor la señal.
update public.reference_inbox
set idioma = public.tax_idioma(concat_ws(' ', suggested_name, left(transcript, 400)))
where idioma is null;

update public.despliegue_variations
set idioma = public.tax_idioma(concat_ws(' ', label, left(notes, 400)))
where idioma is null;

notify pgrst, 'reload schema';
