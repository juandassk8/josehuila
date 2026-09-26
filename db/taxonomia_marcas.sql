-- Marcas: fusiona la misma marca escrita distinto.
--
-- Solo se fusiona lo que es la MISMA empresa. Se verificó con los subnichos y
-- los nombres de anuncio de cada valor antes de decidir; las que quedaron 50/50
-- se dejan separadas a propósito — fusionar dos marcas distintas no se puede
-- deshacer, y tener dos entradas de la misma es un problema menor.
--
-- NO se fusionaron, y por qué:
--   Lummia / Centros Lummia   → productos de cabello vs clínicas de depilación
--                                láser en euros. Negocios distintos.
--   MAGOZ / Mága Zoltán        → láminas de arte vs un violinista húngaro.
--   Ultraliviano / Calzado premium ultraliviano → los dos son calzado pero no
--                                hay dato que confirme que son la misma marca.
--   Sega / Sega Sport          → 10 anuncios cada una, sin subnichos que comparar.

insert into public.tax_sinonimos (eje, desde, hacia_slug) values
  ('marca','ag1','AG1'),
  ('marca','ag1 by athletic greens','AG1'),
  ('marca','petlab','PetLab Co.'),
  ('marca','lsk store','LSK Store'),
  ('marca','try allfemme','AllFemme'),
  ('marca','dramawave - diffuser des dramen','DramaWave'),
  ('marca','dramawave-vip','DramaWave'),
  ('marca','dramawave: shortmax','DramaWave')
on conflict (eje, desde) do update set hacia_slug = excluded.hacia_slug;

-- Para marcas el canónico ES el nombre, no un slug de otra tabla: no hay
-- catálogo de marcas y no debería haberlo — nacen solas con cada import.
create or replace function public.tax_canoniza_marca(arr jsonb)
returns jsonb language sql stable as $fn$
  select coalesce(jsonb_agg(distinct v), '[]'::jsonb) from (
    select coalesce(s.hacia_slug, orig) as v
    from jsonb_array_elements_text(coalesce(arr, '[]'::jsonb)) as orig
    left join public.tax_sinonimos s on s.eje = 'marca' and s.desde = public.tax_norm(orig)
  ) t where v is not null
$fn$;

update public.reference_inbox
set suggested_labels = suggested_labels || jsonb_build_object('marca', public.tax_canoniza_marca(suggested_labels->'marca'))
where suggested_labels ? 'marca';

update public.despliegue_variations
set bank_labels = bank_labels || jsonb_build_object('marca', public.tax_canoniza_marca(bank_labels->'marca'))
where bank_labels ? 'marca';
