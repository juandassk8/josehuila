-- Fusiones: los valores que eran el mismo escritos distinto.
--
-- Cada bloque de abajo salió de mirar los valores reales con sus conteos, no de
-- adivinar. El canónico elegido es, salvo excepción anotada, el más usado.
--
-- Idempotente.

-- ── Nichos ───────────────────────────────────────────────────────────────────

insert into public.tax_nichos (nombre, slug) values
  ('Salud','salud'), ('Belleza','belleza'), ('Suplementos','suplementos'),
  ('Calzado','calzado'), ('Accesorios','accesorios'), ('Ropa','ropa'),
  ('Mascotas','mascotas'), ('Muebles','muebles'), ('Tecnología','tecnologia'),
  ('Viaje','viaje'), ('Arte y cultura','arte-cultura')
on conflict (slug) do nothing;

insert into public.tax_sinonimos (eje, desde, hacia_slug) values
  -- El bug más tonto del banco: dos nichos que solo difieren en la mayúscula.
  ('nicho','calzado','calzado'),
  ('nicho','viajes','viaje'),
  -- No son nichos: son subnichos o ángulos que se colaron un nivel arriba.
  ('nicho','accesorios de viaje','viaje'),
  ('nicho','ergonomia','muebles'),
  ('nicho','bajar de peso','salud')
on conflict (eje, desde) do update set hacia_slug = excluded.hacia_slug;

-- ── Subnichos ────────────────────────────────────────────────────────────────
--
-- De 71 valores a 44. Las fusiones grandes:
--
--   Óptica          ← Gafas (249) + Óptica (165) + Gafas de sol + Lentes
--   Lipedema        ← Lipodema (242) + Lipedema (16). El typo era MÁS común que
--                     la forma correcta, así que el canónico no es el mayoritario.
--   Salud digestiva canina ← cinco variantes que combinaban inmune, articular,
--                     alérgica y alergias. Ninguna combinación es una categoría.

insert into public.tax_nichos (nombre, slug) values ('Salud','salud') on conflict (slug) do nothing;

do $$
declare
  n_salud uuid; n_belleza uuid; n_ropa uuid; n_masc uuid;
  n_acc uuid; n_muebles uuid; n_tec uuid; n_viaje uuid; n_supl uuid; n_calz uuid; n_arte uuid;
begin
  select id into n_salud   from public.tax_nichos where slug='salud';
  select id into n_belleza from public.tax_nichos where slug='belleza';
  select id into n_ropa    from public.tax_nichos where slug='ropa';
  select id into n_masc    from public.tax_nichos where slug='mascotas';
  select id into n_acc     from public.tax_nichos where slug='accesorios';
  select id into n_muebles from public.tax_nichos where slug='muebles';
  select id into n_tec     from public.tax_nichos where slug='tecnologia';
  select id into n_viaje   from public.tax_nichos where slug='viaje';
  select id into n_supl    from public.tax_nichos where slug='suplementos';
  select id into n_calz    from public.tax_nichos where slug='calzado';
  select id into n_arte    from public.tax_nichos where slug='arte-cultura';

  insert into public.tax_subnichos (nicho_id, nombre, slug) values
    (n_belleza,'Cabello','cabello'),
    (n_belleza,'Depilación','depilacion'),
    (n_belleza,'Skincare','skincare'),
    (n_belleza,'Óptica','optica'),
    (n_salud,  'Salud íntima','salud-intima'),
    (n_salud,  'Salud femenina','salud-femenina'),
    (n_salud,  'Salud masculina','salud-masculina'),
    (n_salud,  'Salud digestiva','salud-digestiva'),
    (n_salud,  'Salud mental','salud-mental'),
    (n_salud,  'Salud visual','salud-visual'),
    (n_salud,  'Salud hepática','salud-hepatica'),
    (n_salud,  'Bajar de peso','bajar-de-peso'),
    (n_salud,  'Maternidad','maternidad'),
    (n_salud,  'Lipedema','lipedema'),
    (n_salud,  'Cuidado personal','cuidado-personal'),
    (n_masc,   'Salud digestiva canina','salud-digestiva-canina'),
    (n_masc,   'Salud dental canina','salud-dental-canina'),
    (n_masc,   'Articulaciones caninas','articulaciones-caninas'),
    (n_masc,   'Alergias caninas','alergias-caninas'),
    (n_masc,   'Suplementos para mascotas','suplementos-mascotas'),
    (n_ropa,   'Moda femenina','moda-femenina'),
    (n_ropa,   'Moda masculina','moda-masculina'),
    (n_ropa,   'Moda infantil','moda-infantil'),
    (n_ropa,   'Moda deportiva','moda-deportiva'),
    (n_ropa,   'Pijamas','pijamas'),
    (n_calz,   'Sneakers','sneakers'),
    (n_acc,    'Accesorios','accesorios'),
    (n_tec,    'Audio','audio'),
    (n_tec,    'Gaming','gaming'),
    (n_tec,    'Electrodomésticos','electrodomesticos'),
    (n_muebles,'Sillas gaming','sillas-gaming'),
    (n_muebles,'Escritorios','escritorios'),
    (n_muebles,'Ergonomía','ergonomia'),
    (n_viaje,  'Equipaje','equipaje'),
    (n_viaje,  'Viaje','viaje'),
    (n_supl,   'Suplementos','suplementos'),
    (n_supl,   'Energía y rendimiento','energia-rendimiento'),
    (n_arte,   'Arte y decoración','arte-decoracion'),
    (n_arte,   'Libros','libros')
  on conflict (nicho_id, slug) do nothing;
end $$;

insert into public.tax_sinonimos (eje, desde, hacia_slug) values
  -- Óptica: cuatro nombres para lo mismo.
  ('subnicho','gafas','optica'),
  ('subnicho','gafas de sol','optica'),
  ('subnicho','lentes','optica'),
  -- El typo que se volvió categoría. Canónico = la forma CORRECTA, no la común.
  ('subnicho','lipodema','lipedema'),
  -- Ropa de dormir es pijamas.
  ('subnicho','ropa de dormir','pijamas'),
  -- "Femenina" no agrega nada: salud íntima ya lo es en todos los casos vistos.
  ('subnicho','salud intima femenina','salud-intima'),
  -- Las cinco combinaciones caninas. Ninguna combinación es una categoría.
  ('subnicho','salud digestiva e inmune canina','salud-digestiva-canina'),
  ('subnicho','salud digestiva y articular canina','salud-digestiva-canina'),
  ('subnicho','salud digestiva y alergica canina','salud-digestiva-canina'),
  ('subnicho','salud digestiva y alergias caninas','salud-digestiva-canina'),
  ('subnicho','salud animal','salud-digestiva-canina'),
  ('subnicho','salud dental mascotas','salud-dental-canina'),
  -- Gamer/gaming: la misma silla, la misma mesa.
  ('subnicho','sillas gamer','sillas-gaming'),
  ('subnicho','escritorios gamer','escritorios'),
  ('subnicho','escritorios gaming','escritorios'),
  -- Digestión, microbiota y salud digestiva son el mismo tema.
  ('subnicho','digestion','salud-digestiva'),
  ('subnicho','microbiota','salud-digestiva'),
  ('subnicho','salud digestiva infantil','salud-digestiva'),
  -- Audio portátil es audio.
  ('subnicho','audio portatil','audio'),
  -- Equipaje: maletas, equipaje y accesorios de viaje.
  ('subnicho','maletas','equipaje'),
  ('subnicho','accesorios de viaje','equipaje'),
  -- Deportiva: el "mayorista" es modelo de negocio, no subnicho (ver nota abajo).
  ('subnicho','ropa deportiva','moda-deportiva'),
  ('subnicho','ropa deportiva femenina','moda-deportiva'),
  ('subnicho','moda deportiva mayorista','moda-deportiva'),
  ('subnicho','moda mayorista','moda-femenina'),
  -- Higiene y cuidado personal.
  ('subnicho','higiene personal','cuidado-personal'),
  ('subnicho','depilacion laser','depilacion'),
  ('subnicho','energia','energia-rendimiento'),
  ('subnicho','suplementos nutricionales','suplementos'),
  ('subnicho','arte y cultura','arte-decoracion'),
  -- "Salud" a secas no es un subnicho: es el nicho.
  ('subnicho','salud','salud-digestiva')
on conflict (eje, desde) do update set hacia_slug = excluded.hacia_slug;

-- NOTA sobre "mayorista": aparecía en dos subnichos («Moda mayorista», «Moda
-- deportiva mayorista») pero no es un subnicho — es a quién le vendés. Se
-- absorbe acá para no perder la fila, y el ángulo «Emprendimiento / Reventa»
-- es el que captura ese matiz donde corresponde.
