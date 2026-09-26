-- Correcciones que salieron de revisar el banco con Jose.
--
-- 1 · FOUNDER ≠ EMPRESA. Los había fusionado y está mal: founder es el fundador
--     hablando en primera persona; empresa es la marca presentando sus
--     productos. Son dos conceptos distintos y el banco los usaba bien.
--
-- 2 · ORGÁNICO ≠ UGC. Igual: se quedan separados.
--
-- 3 · Podcast y Entrevista SÍ son lo mismo. B-Roll voz en off y Voz en off
--     también. Esos se fusionan.
--
-- 4 · «Oferta» y «Video Oferta» no eran dos conceptos: eran el MISMO concepto en
--     dos formatos. Esa distinción es real y va en el eje `formato`, no pegada
--     al nombre. De ahí sale lo de abajo.
--
-- 5 · `formato_tipico` gana el valor «ambos». Marcarlo como una sola cosa era
--     una suposición mía, y los datos la desmienten: «Venta» resultó ser 273
--     estáticos contra 3 videos, y «Testimonial» corre en los dos por igual.
--     Los valores nuevos salen del uso REAL, con un umbral de 85/15.

alter table public.tax_conceptos drop constraint if exists tax_conceptos_formato_tipico_check;
alter table public.tax_conceptos add constraint tax_conceptos_formato_tipico_check
  check (formato_tipico in ('video','estatico','ambos'));

-- Founder y Empresa vuelven a ser dos.
delete from public.tax_sinonimos where eje = 'concepto' and desde = 'empresa';
delete from public.tax_sinonimos where eje = 'concepto' and desde = 'organico';

insert into public.tax_conceptos (nombre, slug, etapa_tipica, formato_tipico, descripcion, del_curso, sort_order) values
  ('Empresa',  'empresa',  'mofu', 'video', 'La MARCA presentando sus productos. Distinto de Founder: acá no habla una persona contando por qué creó algo, habla la empresa mostrando lo que vende.', false, 41),
  ('Orgánico', 'organico', 'bofu', 'ambos', 'Contenido que no parece anuncio. Se distingue de UGC en que no hay un creador presentándose: es la marca publicando como si fuera un posteo más.', false, 42)
on conflict (slug) do update set descripcion = excluded.descripcion, formato_tipico = excluded.formato_tipico;

-- Formato real, medido sobre el banco. 85/15 es el umbral: por debajo, el
-- concepto corre en los dos y decir lo contrario haría que el clasificador
-- rechace piezas legítimas.
update public.tax_conceptos set formato_tipico = 'estatico' where slug in ('venta','demostracion','noticia');
update public.tax_conceptos set formato_tipico = 'ambos'
  where slug in ('edits','testimonial','comparativo','educativo','unboxing','dialogo','nosotros-vs-ellos');

-- Las fusiones que Jose confirmó.
insert into public.tax_sinonimos (eje, desde, hacia_slug) values
  ('concepto','entrevista','podcast'),
  ('concepto','podcats','podcast'),
  ('concepto','b-roll voz en off','voz-en-off')
on conflict (eje, desde) do update set hacia_slug = excluded.hacia_slug;

-- Y las filas que estaban bajo los sinónimos deshechos vuelven a su concepto.
update public.reference_inbox set concepto_slug = 'empresa'
where suggested_format ilike 'empresa%' and concepto_slug = 'founder';

update public.reference_inbox set concepto_slug = 'organico'
where suggested_format ilike 'organico%' or suggested_format ilike 'orgánico%';
