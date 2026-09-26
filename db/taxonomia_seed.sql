-- Siembra del vocabulario. Idempotente (upsert por slug).
--
-- Los conceptos con `del_curso = true` son los que el módulo 6 desarrolla, con
-- la descripción TEXTUAL del curso. Los de `false` son los que el curso solo
-- menciona al pasar («hay muchos más: VSL, comercial, diálogo, IA animado,
-- celebridad») más los que el banco ya usaba y no están en el material.
--
-- La distinción importa: si mañana Jose actualiza el curso, sabe exactamente
-- cuáles conceptos vive su metodología y cuáles inventó el banco por el camino.

insert into public.tax_conceptos (nombre, slug, etapa_tipica, formato_tipico, descripcion, del_curso, sort_order) values
  -- TOFU · «En frío no vendes: enganchas.»
  ('UGC',                 'ugc',              'tofu', 'video', 'Persona común hablándole al celular. Entra como recomendación, no como anuncio. El caballo de batalla del frío.', true, 10),
  ('Voz en off',          'voz-en-off',       'tofu', 'video', 'B-roll del producto con una narración que engancha. Ideal para explicar un mecanismo sin cara a cámara.', true, 11),
  ('POV',                 'pov',              'tofu', 'video', 'Grabado en primera persona («cuando por fin encontré…»). Genera identificación inmediata.', true, 12),
  ('Transformacional',    'transformacional', 'tofu', 'video', 'Antes y después potente. El resultado visible hace todo el trabajo de enganche.', true, 13),
  ('Noticia / editorial', 'noticia',          'tofu', 'video', 'Formato tipo reportaje («esto está cambiando la forma de…»). Da autoridad y curiosidad.', true, 14),
  ('VSL',                 'vsl',              'tofu', 'video', 'Video largo de venta. El curso lo menciona sin desarrollarlo.', false, 15),
  ('Comercial',           'comercial',        'tofu', 'video', 'Pieza publicitaria producida. El curso lo menciona sin desarrollarlo.', false, 16),
  ('Diálogo',             'dialogo',          'tofu', 'video', 'Dos personas conversando. El curso lo menciona sin desarrollarlo.', false, 17),
  ('IA animado',          'ia-animado',       'tofu', 'video', 'Generado o animado con IA. El curso lo menciona sin desarrollarlo.', false, 18),
  ('Celebridad',          'celebridad',       'tofu', 'video', 'Figura conocida presentando. El curso lo menciona sin desarrollarlo.', false, 19),
  ('Edits',               'edits',            'tofu', 'video', 'Montaje rápido de clips. Del banco, no del curso.', false, 20),

  -- MOFU · «Ya te vio, pero duda.»
  ('Testimonial',           'testimonial',   'mofu', 'video', 'Cliente real contando su experiencia y resultado. La prueba social más directa.', true, 30),
  ('Profesional / experto', 'profesional',   'mofu', 'video', 'Un especialista (doctor, entrenador…) respalda el producto. Autoridad = confianza.', true, 31),
  ('Founder',               'founder',       'mofu', 'video', 'El dueño cuenta por qué creó la marca. Humaniza y genera cercanía y transparencia.', true, 32),
  ('Unboxing',              'unboxing',      'mofu', 'video', 'Abrir el producto y mostrarlo real. Baja el miedo a «¿y si llega distinto a la foto?».', true, 33),
  ('Punto físico',          'punto-fisico',  'mofu', 'video', 'Muestra que hay una tienda o punto físico real. Prueba de que la marca existe.', true, 34),
  ('Nosotros vs ellos',     'nosotros-vs-ellos', 'mofu', 'video', 'Comparación directa contra la alternativa. El curso lo menciona sin desarrollarlo.', false, 35),
  ('Educativo',             'educativo',     'mofu', 'video', 'Explica el mecanismo. Aparece en el módulo 12 como «educativo del mecanismo».', false, 36),
  ('Podcast / entrevista',  'podcast',       'mofu', 'video', 'Formato conversación larga. El curso lo menciona sin desarrollarlo.', false, 37),

  -- BOFU · «Aquí mandan los estáticos.»
  ('Oferta',           'oferta',         'bofu', 'estatico', 'La promo clara: precio, descuento, envío gratis, botón. Directo al cierre.', true, 50),
  ('Comparativo',      'comparativo',    'bofu', 'estatico', 'Tú vs la alternativa, en una imagen. Justifica por qué elegirte a ti ahora.', true, 51),
  ('Disculpa / aviso', 'disculpa',       'bofu', 'estatico', 'Estático tipo «nos equivocamos con el precio» o aviso: llama la atención y humaniza.', true, 52),
  ('Notas iPhone',     'notas-iphone',   'bofu', 'estatico', 'Texto tipo nota del celular con la oferta o la urgencia. Natural y directo.', true, 53),
  ('Catálogo',         'catalogo',       'bofu', 'estatico', 'Parrilla de producto. Aparece como BOFU en el mini-examen del módulo 6.', false, 54),
  ('Facilidades de pago', 'facilidades-pago', 'bofu', 'estatico', 'Cuotas, contraentrega, financiación. Del banco, no del curso.', false, 55)
on conflict (slug) do update set
  nombre = excluded.nombre, etapa_tipica = excluded.etapa_tipica,
  formato_tipico = excluded.formato_tipico, descripcion = excluded.descripcion,
  del_curso = excluded.del_curso, sort_order = excluded.sort_order;

-- ── Los 4 grupos de ángulos ──────────────────────────────────────────────────
--
-- El curso da los grupos, no los valores. Se siembran unos pocos ángulos
-- genéricos como semilla y ejemplo del nivel de abstracción correcto; los de
-- verdad salen de cada producto y se agregan sobre la marcha.

insert into public.tax_angulos (nombre, slug, grupo) values
  ('Evitar un dolor',        'evitar-dolor',      'dolor'),
  ('Miedo a equivocarse',    'miedo-equivocarse', 'dolor'),
  ('Verse mejor',            'verse-mejor',       'deseo'),
  ('Pertenecer',             'pertenecer',        'deseo'),
  ('Ahorro',                 'ahorro',            'practicidad'),
  ('Ahorro de tiempo',       'ahorro-tiempo',     'practicidad'),
  ('Comodidad',              'comodidad',         'practicidad'),
  ('Prueba social',          'prueba-social',     'confianza'),
  ('Garantía / respaldo',    'garantia',          'confianza'),
  ('No es estafa',           'no-es-estafa',      'confianza')
on conflict (slug) do update set nombre = excluded.nombre, grupo = excluded.grupo;

-- ── Conceptos acordados con Jose revisando el banco real ─────────────────────
--
-- Salieron de mirar los anuncios uno por uno, no del curso. El criterio en cada
-- caso está en la descripción.

insert into public.tax_conceptos (nombre, slug, etapa_tipica, formato_tipico, descripcion, del_curso, sort_order) values
  ('Venta',         'venta',         'tofu', 'video',    'Video de venta directa con precio u oferta adentro. NO es la Oferta del curso, que es un estático. Eran 270 anuncios etiquetados «Venta (Tofu)».', false, 21),
  ('Demostración',  'demostracion',  'mofu', 'video',    'El producto funcionando, sin nadie explicándolo. Estaba etiquetado «Natural» — la maleta que entra en el medidor de la aerolínea.', false, 38),
  ('Post de redes', 'post-redes',    'bofu', 'estatico', 'Captura de un tweet o post usada como anuncio. Hermano de Notas iPhone. Estaba como «Post Ip».', false, 56),
  ('Carrusel',      'carrusel',      'mofu', 'estatico', 'Varias imágenes deslizables. El curso lo menciona como MOFU sin desarrollarlo.', false, 39),
  ('ASMR',          'asmr',          'mofu', 'video',    'El sonido del producto como protagonista. Del banco, no del curso.', false, 40)
on conflict (slug) do update set nombre = excluded.nombre, descripcion = excluded.descripcion;

-- «Emprende» no era una forma de anuncio sino a quién le habla: al que revende.
insert into public.tax_angulos (nombre, slug, grupo) values
  ('Emprendimiento / Reventa', 'emprendimiento', 'deseo')
on conflict (slug) do nothing;
