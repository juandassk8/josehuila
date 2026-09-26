-- Limpieza del eje ángulo.
--
-- De 31 valores, solo 12 eran ángulos. El resto estaba ahí porque no tenía otro
-- lugar donde ir — que es exactamente el problema que resuelven los ejes nuevos.
--
--   8 eran CONCEPTOS  (Educativo, Comparativo, Testimonial, Antes/después…)
--   9 eran TEMAS      (Salud, Cabello, Belleza, Maternidad… ya son nicho/subnicho)
--   2 eran MOMENTO    (Oferta 2.319, Nuevo lanzamiento 2.148 — los dos más usados)
--
-- Antes de reescribir nada se guarda el original en `_labels_v1`. Esto no es
-- reversible de otra forma: los valores viejos no se pueden reconstruir.

-- ── Respaldo ─────────────────────────────────────────────────────────────────

update public.reference_inbox
set suggested_labels = suggested_labels || jsonb_build_object('_labels_v1', suggested_labels)
where suggested_labels is not null and not (suggested_labels ? '_labels_v1');

update public.despliegue_variations
set bank_labels = bank_labels || jsonb_build_object('_labels_v1', bank_labels)
where bank_labels is not null and not (bank_labels ? '_labels_v1');

-- ── Los ángulos que SÍ son ángulos ───────────────────────────────────────────

insert into public.tax_angulos (nombre, slug, grupo) values
  ('Energía y rendimiento',        'energia-y-rendimiento',  'deseo'),
  ('Bajar de peso',                'bajar-de-peso',          'deseo'),
  ('Caída de cabello',             'caida-de-cabello',       'dolor'),
  ('Comodidad y estilo',           'comodidad-y-estilo',     'practicidad'),
  ('Eliminar manchas',             'eliminar-manchas',       'dolor'),
  ('Tratar brotes',                'tratar-brotes',          'dolor'),
  ('Evita copias',                 'evita-copias',           'confianza'),
  ('Antojar nuevas referencias',   'antojar-referencias',    'deseo'),
  ('Control de azúcar',            'control-azucar',         'dolor'),
  ('Tratar lipedema',              'tratar-lipedema',        'dolor'),
  ('Salud hepática',               'salud-hepatica-angulo',  'dolor')
on conflict (slug) do update set grupo = excluded.grupo;

insert into public.tax_sinonimos (eje, desde, hacia_slug) values
  ('angulo','energia sostenida','energia-y-rendimiento'),
  ('angulo','azucar','control-azucar'),
  ('angulo','lipodema','tratar-lipedema'),
  ('angulo','lipedema','tratar-lipedema'),
  ('angulo','salud hepatica','salud-hepatica-angulo')
on conflict (eje, desde) do update set hacia_slug = excluded.hacia_slug;

-- ── Oferta y Nuevo lanzamiento → momento ─────────────────────────────────────

update public.reference_inbox
set momento = 'promocion'
where momento is null and suggested_labels->'angulo' ? 'Oferta';

update public.reference_inbox
set momento = 'lanzamiento'
where momento is null and suggested_labels->'angulo' ? 'Nuevo lanzamiento';

-- ── Sacar del eje ángulo lo que no es ángulo ─────────────────────────────────
--
-- Los conceptos ya viven en `concepto_slug` y los temas en nicho/subnicho, así
-- que no se pierde información al quitarlos de acá — se deja de duplicar.

create or replace function public.tax_limpia_angulos(arr jsonb)
returns jsonb language sql stable as $fn$
  select coalesce(jsonb_agg(distinct v), '[]'::jsonb)
  from jsonb_array_elements_text(coalesce(arr, '[]'::jsonb)) as v
  where public.tax_norm(v) not in (
    -- conceptos disfrazados de ángulo
    'educativo','comparativo','testimonial','testimonial organico','antes/despues',
    'profesional/experto hablando','celebridad','presenta producto uno solo',
    -- temas: ya son nicho o subnicho
    'salud','cabello','belleza','maternidad','salud intima','salud femenina',
    'salud digestiva infantil',
    -- momento: ahora tienen columna propia
    'oferta','nuevo lanzamiento'
  )
$fn$;

update public.reference_inbox
set suggested_labels = suggested_labels || jsonb_build_object(
      'angulo', public.tax_canoniza(public.tax_limpia_angulos(suggested_labels->'angulo'), 'angulo'))
where suggested_labels ? 'angulo';

update public.despliegue_variations
set bank_labels = bank_labels || jsonb_build_object(
      'angulo', public.tax_canoniza(public.tax_limpia_angulos(bank_labels->'angulo'), 'angulo'))
where bank_labels ? 'angulo';
