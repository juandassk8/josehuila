-- Re-escribe las 7 estructuras globales con templates de copywriting expert.
-- Idempotente: borra las globales por nombre y reinserta.

delete from public.company_script_structures
 where company_id is null
   and is_global = true
   and name in ('PAS', 'AIDA', 'BAB', 'Identificativo',
                'Hook + Promesa + Reveal',
                'Si tienes esto, además tienes esto',
                'Antes / Después / Cómo');

insert into public.company_script_structures (company_id, name, description, template, steps, is_global) values

(null, 'PAS', 'Problem · Agitate · Solution. Validá un dolor antes de vender.',
'Framework PAS — la mente humana presta más atención a lo que duele que a lo que promete. Por eso este framework convierte: validás antes de vender.

REGLAS GENERALES
- Hablale en segunda persona, directo, sin rodeos.
- Sé ESPECÍFICO. "Estás cansado" no funciona. "Te despertás con la nuca tensa" sí.
- El primer segundo debe sentirse como un espejo: el avatar piensa "wow, eso me pasa a mí".

ESTRUCTURA

1. PROBLEM (3–7s) — Anclá en una observación SENSORIAL del avatar.
   - Ejemplos buenos: "Llegás del trabajo y solo pensás en el sofá" · "Entrás a tu Shopify y ves los carritos abandonados" · "Te suena el despertador y ya estás cansado".
   - PROHIBIDO: "Estás cansado de X" (genérico). "¿Sabías que X?" (formato anuncio).

2. AGITATE (5–12s) — No exageres el problema; mostrá el COSTO REAL hoy.
   - ¿Qué está perdiendo: tiempo, dinero, energía, oportunidades, una mejor versión de sí mismo?
   - Contrastá con un futuro NO deseado: "y al ritmo que vas, en 6 meses vas a estar igual".
   - 2–3 frases máximo. No repitas el problema, profundizá su consecuencia.

3. SOLUTION (10–20s) — Presentá el producto como la respuesta NATURAL al dolor.
   - Conectá explícito: "Por eso [producto] funciona — porque [mecanismo concreto]".
   - Cerrá con prueba mínima: testimonio, dato científico, demo, antes/después.

CTA — específico, baja fricción.
- ❌ "Compralo ya"
- ✅ "Te dejo el link y entrás a ver, sin compromiso"

EVITÁ
- Vender en el bloque PROBLEM.
- Hablar de la marca/empresa antes de SOLUTION.
- Frases motivacionales vacías ("vos podés").',
'[{"label":"Problem"},{"label":"Agitate"},{"label":"Solution"}]'::jsonb, true),

(null, 'AIDA', 'Attention · Interest · Desire · Action. Clásico de respuesta directa.',
'Framework AIDA — el clásico de copywriting de respuesta directa, adaptado a video corto.

REGLAS GENERALES
- Los primeros 3 segundos definen si te ven o pasan. No los desperdicies.
- Cada bloque debe entregar VALOR aunque el avatar no compre.
- Nada de teasers — entregá la promesa.

ESTRUCTURA

1. ATTENTION (2–3s) — Pattern interrupt.
   - Claim contraintuitivo / dato sorprendente / gesto inesperado / afirmación cortante.
   - Una frase, alta energía.
   - PROHIBIDO: preguntas retóricas vacías ("¿alguna vez te pasó que…?"). Sobreusadas.

2. INTEREST (4–8s) — Construí relevancia con UN reveal concreto.
   - "El patrón que descubrí en mis últimos 30 lanzamientos…" → seguido del patrón real.
   - No teases, das un anticipo concreto. Información primero, venta después.

3. DESIRE (10–18s) — La transformación EN PRESENTE, ya vivida.
   - Lenguaje sensorial: qué van a ver, sentir, escuchar.
   - Apilá beneficios con números específicos: "x3 conversión", "30 % menos CPA".
   - 1 testimonio o prueba concreta.

4. ACTION (3–5s) — CTA bold, claro, baja fricción.
   - Reducí pasos: "Tocá el link de la bio" / "Comentá X" / "DM con la palabra Y".
   - Cero ambigüedad. Una sola acción.

EVITÁ
- Hooks tipo pregunta retórica.
- Lista de features sin marco emocional.
- CTA vago como "infórmate más" o "estate atento".',
'[{"label":"Attention"},{"label":"Interest"},{"label":"Desire"},{"label":"Action"}]'::jsonb, true),

(null, 'BAB', 'Before · After · Bridge. Storytelling de transformación.',
'Framework BAB — vende cuando el avatar siente "ese era yo". Ideal para UGC y testimoniales.

REGLAS GENERALES
- Primera persona ("yo era…") para testimoniales; segunda persona ("vos sos…") para identificación.
- Detalles SENSORIALES > adjetivos. "Mi mañana era café + scroll hasta las 11" > "estaba estancado".
- El BRIDGE no es solo la oferta: es el PIVOTE que cambió todo.

ESTRUCTURA

1. BEFORE (5–10s) — Snapshot detallado del estado anterior.
   - Hora del día, sensación física, frustración específica.
   - Mencioná intentos fallidos brevemente si aplica.
   - Tono empático, sin culpa ni auto-victimización.

2. AFTER (5–10s) — Mismo snapshot, transformado.
   - Mismos marcadores temporales, distintas sensaciones.
   - Presente vivo, no condicional: "Ahora me despierto antes que la alarma" > "podrías despertarte mejor".

3. BRIDGE (8–15s) — El pivote.
   - Puede ser un producto, un mindset shift, una sola decisión.
   - Mantenelo simple — sin tecnicismos.
   - Cerrá con CTA suave: "Si querés probarlo, te dejo el link".

EVITÁ
- Empezar con el producto (quema el storytelling).
- BRIDGE largo y técnico (pierde la magia narrativa).
- Generalidades en BEFORE/AFTER. La fuerza está en los detalles.',
'[{"label":"Before"},{"label":"After"},{"label":"Bridge"}]'::jsonb, true),

(null, 'Identificativo', 'Si te pasa X, este contenido es para vos. Filtra y conecta rápido.',
'Framework Identificativo — filtra al avatar y crea identificación inmediata. Convierte alto cuando el filtro es muy específico.

REGLAS GENERALES
- Usá MÚLTIPLES filtros que compongan: "Si vendés alto ticket Y todavía no tenés CRM Y mensajeás manual…". Cuanto más específico, más conexión.
- Tono de un par, no de un experto desde arriba.
- Confesional > educativo. Sentite del lado del avatar.

ESTRUCTURA

1. IDENTIFICACIÓN (3–6s) — Abrí con "Si te pasa X…" o "Si sos Y que…".
   - Compone 2–3 filtros, el último el más específico.
   - Ej: "Si tenés un ecommerce de suplementos · estás haciendo más de $20M al mes · y todavía vendés a perfil cualquiera…".

2. EMPATÍA (4–8s) — Reflejá la frustración del avatar.
   - 1–2 frases. Dejalo sentir "esta persona me entiende".
   - Sin venta todavía. Solo conexión.

3. SOLUCIÓN (10–18s) — Presentá tu propuesta como la respuesta.
   - Si es producto propio, ganatelo: "Yo pasé por eso, lo que me funcionó fue X".
   - Si es educación, generosidad total — entregá el insight completo.

4. CTA (3–5s) — Suave: "Si te interesa, te dejo el link" / "DM con la palabra X" / "Comentá".

EVITÁ
- Filtros genéricos ("si querés ganar más dinero") — atraen al avatar equivocado.
- Empezar con la solución sin filtrar.
- Tono de coach desde arriba.',
'[{"label":"Identificación"},{"label":"Empatía"},{"label":"Solución"},{"label":"CTA"}]'::jsonb, true),

(null, 'Hook + Promesa + Reveal', 'Frase impactante → qué prometo → cómo lo cumplo. Para reels educativos.',
'Framework Hook + Promesa + Reveal — para contenido educativo. Genera retención porque entregás valor antes de vender.

REGLAS GENERALES
- El hook debe ser una afirmación corta y cortante. NO pregunta.
- La promesa debe ser específica y bounded en tiempo.
- En el reveal sé GENEROSO. Si educás bien, te ganás el seguimiento o la compra.

ESTRUCTURA

1. HOOK (2–4s) — Afirmación contraintuitiva, paradoxal o reveladora.
   - "El error que TODOS cometen al lanzar un producto"
   - "Si haces esto, paras de gastar plata en ads que no convierten"
   - "Estoy a punto de revelarte el sistema que uso para [resultado]"
   - PROHIBIDO: pregunta retórica formato "¿alguna vez…?".

2. PROMESA (3–5s) — Qué le vas a entregar al usuario por seguir mirando.
   - Específico y bounded: "En los próximos 60 segundos te muestro cómo lo arreglé".
   - Maximizá claridad. Cero tease.

3. REVEAL (15–30s) — La explicación que cumple la promesa.
   - Lead con el insight central, soportá con UN ejemplo concreto.
   - Sin filler. Frases cortas. Información densa.
   - Si tu insight tiene 3 puntos, listalos. Si tiene 1, profundizalo.

4. CTA suave (2–4s) — Opcional pero recomendado.
   - "Si querés ver el sistema completo, te dejo el link".
   - Después de educar, te ganás el soft pitch.

EVITÁ
- Hooks formato pregunta retórica.
- Prometer vago ("te voy a contar algunas cosas").
- Cerrar agresivo después de educar — quema la confianza ganada.',
'[{"label":"Hook"},{"label":"Promesa"},{"label":"Reveal"}]'::jsonb, true),

(null, 'Si tienes esto, además tienes esto', 'Listado encadenado de síntomas + diagnóstico común.',
'Framework Listado encadenado — perfecto para mostrar que entendés al avatar mejor que él mismo.

REGLAS GENERALES
- Síntomas SUPER específicos. Cuanto más raros parezcan, más identificación generan.
- El diagnóstico común debe ser un INSIGHT, no algo obvio.
- Vendé la causa raíz, no los síntomas individuales.

ESTRUCTURA

1. APERTURA ENCADENADA (5–8s) — "Si te pasa X, también te pasa Y, también Z…"
   - 3–5 síntomas en cascada.
   - El último siempre el más raro o doloroso.
   - Ej (para suplemento hormonal mujer): "Si tenés acné en el mentón… también te despertás con la cara hinchada… también notás que se te cae más pelo… también tenés ciclos irregulares…"

2. DIAGNÓSTICO (5–8s) — Reveláis la causa común.
   - Que sea un INSIGHT, no algo trivial.
   - Ej: "Todo eso es desbalance hormonal por estrés crónico — no es genética".
   - Pausa después del reveal para que el avatar procese.

3. SOLUCIÓN (8–15s) — Tu producto/método aborda la CAUSA, no los síntomas.
   - Mostrá el mecanismo brevemente: cómo ataca la causa raíz.
   - Una mini-prueba (estudio, testimonio, demo).

4. CTA (3–5s) — Específico.

EVITÁ
- Síntomas obvios o genéricos ("si estás cansada").
- Diagnóstico que cualquiera adivinaría.
- Saltar a vender sin entregar el insight.',
'[{"label":"Apertura encadenada"},{"label":"Diagnóstico"},{"label":"Solución"},{"label":"CTA"}]'::jsonb, true),

(null, 'Antes / Después / Cómo', 'Comparativo storyteller. Funciona excelente con UGC y testimoniales.',
'Framework Storyteller — la fuerza está en los DETALLES concretos que el avatar reconoce.

REGLAS GENERALES
- Tono confesional, primera persona.
- DETALLES > adjetivos. Marcadores temporales, sensaciones físicas, momentos específicos.
- El "cómo" no debe sonar a venta — debe sonar a recomendación de un par.

ESTRUCTURA

1. ANTES (8–15s) — La persona vivida.
   - Frustración específica con detalles:
     · Marcadores temporales ("a las 3pm", "los lunes a la mañana").
     · Sensaciones físicas (tensión, fatiga, vergüenza).
     · Intentos fallidos ("probé X, Y, Z, ninguno funcionó").
   - Tono empático, sin auto-victimización.

2. DESPUÉS (8–15s) — Misma persona, transformada.
   - EN PRESENTE, vivido. NO condicional ("podrías…").
   - Mismos marcadores, distintas sensaciones: "Ahora a las 3pm sigo concentrado".
   - El contraste claro entre BEFORE y AFTER es lo que vende.

3. CÓMO (10–20s) — Reveláis el método/producto.
   - Sin hype. Como un par recomendando: "Lo que cambió fue que empecé a [acción] / usar [producto]".
   - Mecanismo simple, no técnico.
   - CTA suave acá: "Si querés probarlo, te dejo el link".

EVITÁ
- ANTES y DESPUÉS desconectados (los marcadores tienen que coincidir).
- "Cómo" muy detallado o técnico — pierde la magia narrativa.
- Tono de testimonio falso/escripteado.',
'[{"label":"Antes"},{"label":"Después"},{"label":"Cómo"}]'::jsonb, true);

notify pgrst, 'reload schema';
