// Generador de guiones para los slots del Content Pipeline.
//
// Distinto del Guionista (/api/generate-script), que escribe en formato libre a
// partir de una idea. Acá el slot YA tiene todo el contexto — producto, ángulo,
// concepto, creador y hasta 3 referentes del banco con su transcripción — y lo
// que se pide es siempre lo mismo: 5 hooks bien distintos, un body y un CTA, con
// una extensión parecida a la del referente.
//
// Dos pasadas:
//
//   mode: "blueprint"  — transcripción de un referente → esqueleto ESTRUCTURAL
//     (arquetipo del hook, beats, arco, conciencia, objeción, ritmo, CTA). Se
//     cachea en despliegue_variations.script_blueprint y se reusa para siempre.
//
//   mode: "generate"   — blueprint + producto + ángulo + guiones ganadores →
//     el guion. Recibe una ESTRUCTURA, no el texto del anuncio ajeno: por eso
//     copia lo que funciona sin copiar los claims (el bug de "7 días / pagás
//     después" que ya mordió en el Guionista).
//
// La salida va por tool use forzado con schema, no por markdown: así los 5 hooks
// son 5 de verdad, cada uno viene etiquetado con su arquetipo y con su conteo de
// palabras, y no hace falta parsear nada con regex.

import { requireCompanyAccess, sendAuthError, serviceClient } from "./_lib/auth.js";
import { detectTeamBypass, enforceCompanyTokenLimits, logUsage } from "./_lib/rateLimit.js";
import { empresaConGuionista } from "./_lib/guionista.js";
import { buildCompanyContext, findAngle, findProduct } from "./_lib/companyContext.js";
import { ARCHETYPE_KEYS, archetypeLabel, archetypesForPrompt } from "./_lib/hookArchetypes.js";
import { checkScript, measureWords } from "./_lib/scriptChecks.js";
import { normalizeBlueprint, asArray } from "./_lib/blueprintShape.js";

export const config = {
  api: { bodyParser: { sizeLimit: "4mb" } },
  maxDuration: 300,
};

export const MODEL = "claude-sonnet-4-6";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

// Sin referente no hay ancla de extensión: 150 palabras ≈ 47s a 190 wpm, que es
// la duración típica de un creativo de performance.
const DEFAULT_TARGET_WORDS = 150;
// Tolerancia sobre el presupuesto antes de pedir corrección.
const WORD_TOLERANCE = 0.15;

const countWords = (s) =>
  String(s || "").split(/[^\p{L}\p{N}']+/u).filter(Boolean).length;

const clean = (s, max = 4000) => String(s || "").trim().slice(0, max);

export async function callClaude(body) {
  const resp = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model: MODEL, ...body }),
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`Anthropic ${resp.status}: ${txt.slice(0, 400)}`);
  }
  return resp.json();
}

// Suma el usage de varias llamadas para loguearlo una sola vez al final.
function addUsage(acc, usage) {
  if (!usage) return acc;
  acc.inputTokens += usage.input_tokens || 0;
  acc.outputTokens += usage.output_tokens || 0;
  acc.cacheCreationTokens += usage.cache_creation_input_tokens || 0;
  acc.cacheReadTokens += usage.cache_read_input_tokens || 0;
  return acc;
}

// ─── Pasada A: blueprint del referente ───────────────────────────────────────

// Versión del esquema del blueprint. Los cacheados con una versión anterior se
// recalculan (ver prepareRef en src/team/pipeline/data/scriptAI.js).
export const BLUEPRINT_VERSION = 5;

const FORM_DESC =
  "PLANTILLA RELLENABLE en español que conserva la construcción EXACTA de esta parte del " +
  "anuncio. Se copian verbatim los conectores, la sintaxis y el andamiaje retórico; se " +
  "reemplazan por [huecos] SOLO los sustantivos y verbos del tema ajeno. Un hueco dice QUÉ " +
  "TIPO de cosa va ([señal 1]), nunca el contenido original ([lamerse las patas]).";

export const BLUEPRINT_TOOL = {
  name: "entregar_blueprint",
  description: "Devuelve el esqueleto estructural del anuncio analizado: su forma retórica, sin su tema.",
  input_schema: {
    type: "object",
    properties: {
      hook: {
        type: "object",
        description: "El gancho: las primeras frases, hasta antes de que empiece a desarrollar.",
        properties: {
          archetype: { type: "string", description: "Arquetipo del hook. Usá una de estas claves si encaja; si el anuncio abre de una forma que no está en la lista, describila en dos o tres palabras en vez de forzar una que no es." },
          form: { type: "string", description: FORM_DESC + " Es la parte MÁS importante del blueprint: de acá sale el hook del guion nuevo." },
          devices: { type: "array", items: { type: "string" }, description: "Recursos retóricos exactos: 'imperativo negativo', 'enumeración de tres', 'antítesis', 'pregunta directa', 'cifra', 'segunda persona'." },
          promise: { type: "string", description: "QUÉ LE PROMETE el gancho al espectador, que el cuerpo después cumple. Ej: 'enumerar N razones por las que el producto le sirve a un público concreto', 'mostrar qué cambia en un plazo dado'. Es lo que hace que el cuerpo sea la respuesta a la pregunta que abrió el hook." },
          sets_up: { type: "string", description: "QUÉ DEJA PARADO el hook que el cuerpo después da por sentado: la voz de quién narra, un marco condicional ('lo que pasaría si…'), una cuenta regresiva o línea de tiempo, una enumeración que después recorre, un personaje. Es lo que hace que el primer beat del cuerpo no arranque colgado. Si el cuerpo funcionaría igual sin ningún setup, decí '(ninguno)'." },
          words: { type: "integer" },
          why: { type: "string", description: "Por qué frena el scroll. Una frase." },
        },
        required: ["archetype", "form", "devices", "promise", "sets_up", "words", "why"],
      },
      beats: {
        type: "array",
        description: "Los beats del cuerpo en orden, sin contar el hook ni el CTA.",
        items: {
          type: "object",
          properties: {
            purpose: { type: "string", description: "Qué logra este beat (ej: 'muestra la consecuencia de no resolverlo')." },
            gist: { type: "string", description: "La FUNCIÓN del beat, en abstracto y sin tema. PROHIBIDO nombrar los síntomas, comportamientos, partes del cuerpo, condiciones, ingredientes o mecánica del anuncio original. Escribilo de modo que sirva igual para un producto de cualquier categoría." },
            form: { type: "string", description: FORM_DESC },
            connector: { type: "string", description: "La bisagra con la que arranca el beat, tal cual (traducida): 'A menudo', 'La verdad es que', 'Por eso', 'Así que', 'Y lo peor'. '(ninguna)' si arranca directo." },
            words: { type: "integer", description: "Palabras aproximadas de este beat." },
          },
          required: ["purpose", "gist", "form", "connector", "words"],
        },
      },
      cta: {
        type: "object",
        description: "El cierre: desde que pide la acción hasta el final.",
        properties: {
          form: { type: "string", description: FORM_DESC + " Incluí el recap de síntomas o la condicional si el anuncio los usa antes del llamado." },
          cta_type: { type: "string", description: "Tipo de cierre: oferta directa, prueba sin riesgo, link en bio, urgencia." },
          words: { type: "integer" },
        },
        required: ["form", "cta_type", "words"],
      },
      premise: { type: "string", description: "LA IDEA DEL VIDEO: la ficción o dispositivo narrativo que enmarca TODO el anuncio, escrito como regla reutilizable para otro producto. Ej: 'el sujeto que sufre el problema habla en primera persona a su dueño, contándole lo que no puede decirle con palabras'. Si el anuncio no tiene ficción y es alguien hablándole derecho a cámara, decilo así de simple." },
      pov: { type: "string", description: "Quién habla y a quién, en una frase corta y accionable: 'el perro le habla a su dueño', 'el dueño le habla al espectador', 'narrador en off le habla al espectador'." },
      register: { type: "string", enum: ["narrado", "telegrafico", "mixto"], description: "¿Habla con frases completas y conectores (narrado), o con fragmentos cortados (telegráfico)?" },
      voice_person: { type: "string", description: "Marca gramatical dominante: 'primera persona', 'segunda persona', 'tercera persona'." },
      arc: { type: "string", description: "Arco del anuncio en 3-6 pasos separados por →. Ej: problema → agitación → solución → prueba → oferta." },
      awareness_level: { type: "string", description: "Nivel de conciencia del espectador al que le habla: inconsciente, consciente del problema, de la solución, del producto, o muy consciente." },
      objection_targeted: { type: "string", description: "La objeción principal que desactiva. '(ninguna)' si no ataca ninguna." },
      pacing: { type: "string", enum: ["lento", "medio", "rapido"], description: "Ritmo del anuncio." },
      total_words: { type: "integer", description: "Total de palabras habladas del anuncio." },
      why_it_works: { type: "string", description: "Por qué funciona este anuncio, en 1-2 frases. Enfocate en el mecanismo, no en el producto." },
    },
    required: ["premise", "pov", "hook", "beats", "cta", "register", "voice_person", "arc", "awareness_level", "objection_targeted", "pacing", "total_words", "why_it_works"],
  },
};

const BLUEPRINT_SYSTEM = `Sos un analista de creativos publicitarios. Te dan la transcripción de un anuncio que funcionó y tenés que destilar el MOLDE con el que está escrito, para que otro anuncio —de otro producto, en español— se pueda escribir con ese mismo molde.

# LO QUE SE TRANSFIERE Y LO QUE NO

Un anuncio tiene dos capas. Separarlas es todo tu trabajo:

- **LA FORMA** — la construcción de las frases, los conectores, el orden de las ideas, las
  figuras retóricas. **Esto SÍ se transfiere.** Es lo valioso: es lo que hizo que el anuncio
  funcionara y lo único que otro producto puede reutilizar.
- **EL TEMA** — los síntomas, comportamientos, partes del cuerpo, condiciones, ingredientes,
  mecanismos, precios, plazos y garantías. **Esto NO se transfiere NUNCA.** El producto nuevo
  es de otra categoría: si el tema se cuela, el guion habla de cosas que a ese producto no le
  pasan; si se cuelan los claims, es publicidad engañosa.

# CÓMO SE ESCRIBE UN \`form\`

\`form\` es una **plantilla rellenable**: la frase original con el tema vaciado en \`[huecos]\`
y TODO lo demás intacto. Conectores, sintaxis, orden, ritmo y figura retórica van verbatim
(traducidos al español). Solo se reemplazan los sustantivos y verbos del tema.

Un hueco nombra QUÉ TIPO de cosa va, nunca el contenido original:
- BIEN: \`[señal 1]\`, \`[solución superficial]\`, \`[causa interna]\`
- MAL: \`[lamerse las patas]\`, \`[shampoo]\`, \`[bacterias del intestino]\`

Ejemplos, sobre un anuncio de salud intestinal para perros:

ORIGINAL   "Never ignore these three hidden distress dog behaviors. Paw licking, itching,
            and head shaking."
form       "Nunca ignores estas tres [señales ocultas de que tu perro está sufriendo].
            [Señal 1], [señal 2] y [señal 3]."
devices    ["imperativo negativo", "enumeración de tres", "segunda persona"]

ORIGINAL   "Often, owners either ignore these cries for help, or they turn to shampoos,
            which only address the problem on the surface."
form       "A menudo, los dueños o bien [ignoran estas señales], o bien recurren a
            [solución superficial], que solo ataca [el problema] por fuera."
connector  "A menudo"

ORIGINAL   "No complicated routine, no fighting with sprays, no 10 different supplements,
            just daily support in one chew."
form       "Sin [complicación 1], sin [complicación 2], sin [complicación 3]. Solo
            [la solución simple, en una frase]."

Fijate que el molde sobrevive entero — "Nunca ignores estas tres…", "o bien… o bien…, que
solo ataca por fuera", el tricolon de negaciones — y del tema no queda nada.

**La prueba:** leé tu \`form\` e imaginá que el producto nuevo es un colchón, un software de
contabilidad o un curso de inglés. Si los huecos se pueden llenar y la frase sigue
funcionando, está bien. Si algún hueco solo tiene sentido para el producto original, está
mal: vacialo más.

# LA PREMISA: LA IDEA DEL VIDEO

Antes que nada, identificá **de qué va el video como idea**. Muchos anuncios que funcionan
tienen una ficción o un dispositivo que los enmarca, y todo lo demás vive adentro de esa
ficción. Si te la salteás, el guion nuevo sale partido: un gancho por un lado y un cuerpo
por otro.

Ejemplo. Si el anuncio abre con "If I could talk to my owner about my gut, this is what I'd
say" y sigue con el perro contando sus síntomas en primera persona:
- premise → "el sujeto que padece el problema habla en primera persona a su dueño, diciéndole
  lo que no puede decirle con palabras"
- pov → "el perro le habla a su dueño"

Escribí la premisa como **regla reutilizable**, no como resumen del anuncio: alguien tiene
que poder leerla y escribir un anuncio nuevo de otro producto respetándola. Si el anuncio no
tiene ninguna ficción —es una persona hablándole derecho a cámara— decilo así de simple; no
inventes un dispositivo que no está.

# EL RESTO

- \`gist\` y \`purpose\` van en abstracto (la función del beat), sin tema. La forma la guarda
  \`form\`; no dupliques ahí la explicación.
- Los conteos de palabras se usan como presupuesto del guion nuevo. Contá con cuidado.
- \`register\`: si el anuncio habla con frases completas y conectores, es \`narrado\`. Poné
  \`telegrafico\` solo si de verdad corta en fragmentos sueltos.
- Si la transcripción está en otro idioma, analizala igual y devolvé TODO en español.
- Las plantillas se escriben en **español neutro con "tú"** ("descubre", "prueba", "toca
  abajo"), nunca en voseo ("descubrí", "probá", "tocá"). El guion final se escribe con "tú",
  y como las plantillas se copian casi literales, un verbo voseado acá termina mezclando
  formas en el guion.

Elegí el \`archetype\` del hook de esta lista cerrada:
${archetypesForPrompt()}`;

export async function runBlueprint(transcript, usage) {
  const data = await callClaude({
    // Las plantillas ocupan bastante más que la versión anterior del esquema.
    max_tokens: 3000,
    system: [{ type: "text", text: BLUEPRINT_SYSTEM, cache_control: { type: "ephemeral" } }],
    tools: [BLUEPRINT_TOOL],
    tool_choice: { type: "tool", name: BLUEPRINT_TOOL.name },
    messages: [{ role: "user", content: `Transcripción del anuncio:\n"""\n${clean(transcript, 20000)}\n"""\n\nDestilá el molde con el que está escrito.` }],
  });
  addUsage(usage, data.usage);
  const block = (data.content || []).find((c) => c.type === "tool_use");
  if (!block) throw new Error("El modelo no devolvió el blueprint.");
  // El modelo a veces devuelve `beats` como el array SERIALIZADO. Se corrige acá,
  // antes de que se cachee: un blueprint mal formado se guarda "para siempre" y
  // rompe ese referente en cada generación futura. Ver _lib/blueprintShape.js.
  return { ...normalizeBlueprint(block.input), version: BLUEPRINT_VERSION };
}

// ─── Pasada B: generación del guion ──────────────────────────────────────────

export const SCRIPT_TOOL = {
  name: "entregar_guion",
  description: "Devuelve el guion completo: 5 hooks, body y CTA.",
  input_schema: {
    type: "object",
    properties: {
      hooks: {
        type: "array",
        description: "Exactamente 5 hooks, cada uno de un arquetipo DISTINTO.",
        minItems: 5,
        maxItems: 5,
        items: {
          type: "object",
          properties: {
            archetype: { type: "string", enum: ARCHETYPE_KEYS },
            text: { type: "string", description: "El hook tal cual se dice en cámara. Sin comillas ni acotaciones." },
            mirrors_reference: { type: "boolean", description: "true SOLO en el hook 1, que se escribe rellenando la plantilla del referente. false en los otros cuatro." },
            connects_to_body: { type: "string", description: "En una frase: cómo enlaza ESTE hook con el primer beat del cuerpo. Si no podés explicar el enlace, el hook está mal y hay que reescribirlo — no inventes la explicación." },
            words: { type: "integer" },
          },
          required: ["archetype", "text", "mirrors_reference", "connects_to_body", "words"],
        },
      },
      body: {
        type: "array",
        description: "El cuerpo del guion en beats, en orden. Sirve para cualquiera de los 5 hooks.",
        items: {
          type: "object",
          properties: {
            text: { type: "string", description: "Lo que se dice en cámara en este beat." },
            words: { type: "integer" },
          },
          required: ["text", "words"],
        },
      },
      cta: {
        type: "object",
        properties: {
          text: { type: "string", description: "El cierre tal cual se dice en cámara." },
          words: { type: "integer" },
        },
        required: ["text", "words"],
      },
      promise: { type: "string", description: "LA PROMESA DEL GUION, en una frase: qué le prometés al espectador que el cuerpo cumple. Deducila del cuerpo, no de los hooks. Es UNA sola — hay un solo cuerpo — y los 5 hooks son cinco maneras de hacerla. Ej: 'las 4 razones por las que Peluna Fresh le sirve a un perro braquicéfalo'." },
      notes_for_creator: { type: "string", description: "2-4 frases de guía de grabación: qué se ve, tono, ritmo. No es texto hablado." },
    },
    required: ["hooks", "body", "cta", "promise", "notes_for_creator"],
  },
};

export function buildSystemPrompt({ companyName, companyCtx, voice, product }) {
  const rules = [];
  if (voice?.must_say?.trim()) rules.push(`## OBLIGATORIO MENCIONAR (en cada guion)\n${voice.must_say.trim()}`);

  // Los prohibidos viven en dos niveles y se suman: los de la empresa (lo
  // transversal, tipo la forma de pago) y los del producto (tipo sus
  // ingredientes, que a otro producto sí le pueden servir).
  const forbidden = [voice?.never_say, product?.never_say]
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .join("\n");
  if (forbidden) {
    rules.push(`## PROHIBIDO — nunca aparece en el guion\n${forbidden}\n\nEsto no se negocia y no se esquiva con sinónimos: si un tema está prohibido, el guion no lo menciona ni de refilón. Si te quedás sin argumento por eso, usá otro beneficio real del producto.`);
  }
  if (voice?.accumulated_feedback?.trim()) rules.push(`## REGLAS APRENDIDAS DE CORRECCIONES PREVIAS (críticas)\n${voice.accumulated_feedback.trim()}`);
  if (voice?.phrases?.trim()) rules.push(`## FRASES SIGNATURE DE LA MARCA\n${voice.phrases.trim()}`);

  return `Sos el guionista de ${companyName || "la marca"}. Escribís guiones de anuncios de video para redes (Reels, TikTok, Shorts): directos, hablados, sin relleno.

# REGLA INNEGOCIABLE — DE DÓNDE SALE CADA COSA

Vas a recibir el ESQUELETO de un anuncio ajeno que funcionó. De ese esqueleto copiás SOLO: el orden de los beats, el ritmo, el tipo de gancho, el arco emocional y la extensión.

Los CLAIMS — qué hace el producto, qué promete, en cuánto tiempo, cuánto cuesta, cómo se paga, qué incluye, qué garantiza — salen EXCLUSIVAMENTE de la INFORMACIÓN DEL PRODUCTO. Sin excepción.

Si el esqueleto pide un beat que el producto no puede sostener (ej: "prueba gratis 30 días" y el producto no la tiene), reescribís ese beat con algo REAL del producto que cumpla la misma función narrativa. Nunca lo inventás y nunca lo dejás vacío.

**Todo síntoma, comportamiento, escena o dolor que menciones tiene que salir de la INFORMACIÓN DEL PRODUCTO o del ÁNGULO de este creativo.** El esqueleto te dice qué FUNCIÓN cumple cada beat ("abre nombrando conductas visibles que el dueño ya notaba"), y vos la llenás con las conductas reales de NUESTRO problema. Si en el esqueleto quedó pegado algún síntoma del anuncio original, ignoralo: es ruido, no es un dato de nuestro producto. Un guion que menciona un síntoma que nuestro producto no resuelve confunde al comprador y quema el creativo.

Prohibido inventar cifras, estudios, testimonios, plazos o resultados que no estén en la información del producto.

Prohibido poner una afirmación en boca de un tercero que no figure en la información del producto: "el veterinario me dijo", "los médicos recomiendan", "un estudio demostró", "los expertos coinciden". Aunque el dato en sí sea correcto, la atribución inventada es un testimonio falso. Si el referente usaba una figura de autoridad como recurso, reemplazala por experiencia propia ("me di cuenta de que…") o por el dato a secas ("el sarro termina afectando otros órganos").

# IDIOMA

Español neutro de Latinoamérica, siempre — aunque el referente esté en inglés. Nada de traducción literal: se reescribe con la voz de la marca. Sin slang regional marcado ("parce", "che", "wey", "tío", "vale").

Usá **"tú"** y mantenelo en TODO el guion, hooks incluidos. Prohibido mezclar formas: si un hook dice "tú giras la cara" y el body dice "notás" o el CTA dice "pedí", suena a dos personas distintas hablando y delata que lo escribió una máquina. Elegí una sola conjugación y sostenela de la primera palabra a la última.

# CÓMO ESCRIBÍS

- Se lee en voz alta. Si no lo dirías hablando, no va.
- Cada frase gana la siguiente. Nada de párrafos que se puedan saltar.
- Concreto sobre abstracto: escenas y objetos, no adjetivos.
- Sin emojis, sin hashtags, sin acotaciones de cámara dentro del texto hablado (eso va en notes_for_creator).
- El body funciona con CUALQUIERA de los 5 hooks: no arranca refiriéndose a uno en particular.

**Esto es alguien hablando, no una ficha técnica.** El error más común es entregar
enumeraciones de sustantivos sin verbo — "Encías inflamadas, sarro amarillo, aliento que te
hace girar la cara." / "Sin cepillo. Sin forcejeo." — que se leen como viñetas de PowerPoint
y suenan a máquina. Salvo que el referente sea telegráfico (te lo dice su \`register\`),
escribí frases completas, con sujeto y verbo, hilvanadas por los conectores del esqueleto:
"A menudo…", "La verdad es que…", "Por eso…", "Así que…". Esas bisagras son las que hacen
que suene narrado en vez de recitado.

Frases cortas sí, fragmentos sueltos no: son cosas distintas.

# LOS 5 HOOKS

**Hay un solo cuerpo. Entonces hay una sola promesa, y el hook es esa promesa.**

Los 5 hooks prometen exactamente lo mismo: lo que el cuerpo cumple. Lo que cambia entre ellos
es POR DÓNDE ENTRAN —el tono, el arquetipo, la primera imagen— nunca QUÉ prometen. Un hook
que promete otra cosa es inservible por bien escrito que esté: quien lo elija graba un video
donde la pregunta del inicio nunca se responde.

Antes de escribir los hooks, escribí \`promise\`: leé el cuerpo y decí en una frase qué le
prometés al espectador. Después los cinco hooks hacen ESA promesa.

## Los tres modos de romperlo

Los tres pasaron de verdad con este sistema. Léelos antes de dar un hook por bueno.

**1. Cambiar quién habla.** Anuncio donde el perro le habla a su dueño; el cuerpo dice "mis
dientes", "mi manera de decirte". Un hook decía *"Tu perro te lame la cara y giras la
cabeza"* — correcto en abstracto, pero le habla al dueño desde afuera. El video arrancaba con
una voz y seguía con otra.

**2. No plantar el marco.** El cuerpo iba "Después del primer día… Después de una semana…" y
cuatro hooks nunca mencionaban el plazo. El espectador oía *"Después del primer día"* — ¿de
qué primer día? Nadie lo dijo.

**3. Cambiar de qué es la lista.** El cuerpo enumeraba cuatro beneficios del producto, y un
hook prometía *"hay cuatro razones para evitar llevarlo al veterinario"*. Mantuvo el número y
cambió el sujeto: el cuerpo terminaba respondiendo otra pregunta. **Si el cuerpo es una lista,
todos los hooks anuncian la MISMA lista, con el mismo número y sobre lo mismo.**

La prueba, hook por hook: leelo, y leé inmediatamente después el primer beat del cuerpo. Si el
cuerpo no es la respuesta a lo que ese hook acaba de prometer, el hook está mal. Escribí en
\`connects_to_body\` cómo enlaza; si no te sale la explicación, es porque no enlaza.

## El hook 1 calca la construcción del referente

Abajo viene su plantilla (\`form\`): rellená los huecos y respetá todo lo demás — tipo de
frase, conectores, orden, figura retórica, cantidad de elementos si enumera. Marcalo con
\`mirrors_reference: true\`.

**Si la plantilla tiene un hueco de público o contexto, ahí va el ÁNGULO de este creativo**,
que es el dolor concreto que estamos atacando. No una descripción genérica del producto.

Ejemplo real. Plantilla: *"N razones por las que [producto] es [el mejor aliado de X]"*.
- FLOJO: "Cuatro razones por las que Peluna Fresh es el cuidado dental sin anestesia"
  → describe el producto, no le habla a nadie en particular.
- BIEN: "Cuatro razones por las que Peluna Fresh se volvió el mejor amigo de los braquicéfalos"
  → el hueco lleva el ángulo, y el dueño de un pug se reconoce de inmediato.

## Los hooks 2 a 5

Misma promesa, otra puerta. Cada uno con un arquetipo distinto del hook 1 y entre sí.

- Ningún par empieza con las mismas 3 palabras. No pueden ser los 5 preguntas.
- Cada uno funciona solo, en los primeros 2 segundos, sin contexto previo.
- Si al leerlo alguien que sufre el problema no se reconoce, está mal. Preferí lo obvio y
  visceral antes que lo ingenioso.

Cuando el cuerpo es rígido —una lista, una progresión— los cinco se van a parecer más entre
sí. Está bien: es la señal de que los cinco enganchan. Vale más eso que cinco hooks vistosos
de los que solo uno sirve.

Arquetipos disponibles:
${archetypesForPrompt()}
${companyCtx}
${rules.join("\n\n")}`;
}

function renderBlueprint(bp, i) {
  // `asArray` y no `|| []`: los blueprints cacheados antes de la normalización
  // pueden traer `beats` como string, y un string es truthy — pasa el `||` y
  // revienta en el `.map`.
  const beats = asArray(bp.beats).map((b, n) => {
    const conn = b.connector && b.connector !== "(ninguna)" ? ` · bisagra: "${b.connector}"` : "";
    return `  Beat ${n + 1} — ${b.words} palabras${conn}\n    función: ${b.purpose}\n    PLANTILLA: ${b.form || b.gist || "—"}`;
  }).join("\n");

  const hook = bp.hook || {};
  return `### Esqueleto ${i + 1}

  ★ IDEA DEL VIDEO (la premisa — los 5 hooks y el body viven acá adentro):
    ${bp.premise || "—"}
    Quién habla: ${bp.pov || bp.voice_person || "—"}

- Arco: ${bp.arc}
- Le habla a: ${bp.awareness_level} · Objeción que desactiva: ${bp.objection_targeted}
- Registro: ${bp.register || "narrado"} · Voz: ${bp.voice_person || "—"} · Ritmo: ${bp.pacing}
- Extensión original: ${bp.total_words} palabras
- Por qué funciona: ${bp.why_it_works}

  GANCHO — ${hook.words || "?"} palabras · arquetipo \`${hook.archetype || "—"}\`
    recursos: ${asArray(hook.devices).join(", ") || "—"}
    DEJA PARADO (los 5 hooks tienen que dejar parado esto mismo): ${hook.sets_up || "—"}
    por qué frena el scroll: ${hook.why || "—"}
    PLANTILLA DEL HOOK 1 (rellenala, no la reemplaces):
    ${hook.form || "—"}

  CUERPO:
${beats || "  (sin beats)"}

  CIERRE — ${bp.cta?.words || "?"} palabras · tipo: ${bp.cta?.cta_type || "—"}
    PLANTILLA: ${bp.cta?.form || "—"}`;
}

export function buildUserMessage({ slot, blueprints, winners, concept, angle, targetWords, hooksOnly, existing, instruction, current }) {
  const parts = [];

  parts.push(`# EL CREATIVO QUE HAY QUE ESCRIBIR

- Producto: ${slot.producto || "—"}
- Ángulo de venta: ${angle ? `**${angle.title}**${angle.desc ? ` — ${angle.desc}` : ""}` : (slot.angulo || "—")}
- Concepto / formato: ${slot.concepto || "—"}
- Quién lo graba: ${slot.creador || "—"}
- Idea en una línea: ${slot.desc || "—"}`);

  if (concept?.execution?.trim() || concept?.description?.trim()) {
    parts.push(`# CÓMO SE EJECUTA ESTE CONCEPTO
${concept.description?.trim() ? `${concept.description.trim()}\n` : ""}${concept.execution?.trim() || ""}`);
  }

  if (blueprints.length) {
    parts.push(`# ESQUELETO${blueprints.length > 1 ? "S" : ""} DE REFERENCIA — este es el MOLDE del guion

Sale de un anuncio de otra categoría que funcionó. Trae **plantillas rellenables**: la
construcción exacta de cada parte, con \`[huecos]\` donde iba el tema del anuncio original.

**Tu trabajo es rellenar los huecos, no reemplazar las plantillas.** Se respetan los
conectores, el tipo de frase, el orden de las ideas y las figuras retóricas. Se cambia solo
lo que va adentro de los corchetes, y sale del PRODUCTO y del ÁNGULO de arriba — nunca del
anuncio original.

Dos errores opuestos, los dos graves:
- Escribir algo distinto "porque queda mejor" → el molde probado no se usó y el guion sale
  genérico. Es el error más frecuente.
- Rellenar un hueco con contenido del anuncio original → el guion habla de cosas que a
  nuestro producto no le pasan.

Si un beat no tiene equivalente honesto en nuestro producto, conservá su construcción y
cambiá lo que dice por lo que sí necesita nuestro comprador en ese punto del guion. Adaptar
el contenido, sí; abandonar la forma, no.

${blueprints.map(renderBlueprint).join("\n\n")}${blueprints.length > 1 ? "\n\nUsá el Esqueleto 1 como base y tomá del resto lo que sume." : ""}`);
  } else {
    parts.push(`# SIN REFERENTE
No hay anuncio de referencia. Construí la estructura vos: gancho → problema concreto → mecanismo del producto → prueba → cierre.`);
  }

  if (winners.length) {
    parts.push(`# GUIONES PROPIOS QUE YA GANARON — este es el estándar a igualar

Son anuncios reales de la marca con buen rendimiento. Copiá su VOZ, su nivel de concreción y su manera de cerrar. No copies su contenido.

${winners.map((w, i) => `### Ganador ${i + 1}${w.tag ? ` (${w.tag})` : ""}\n"""\n${clean(w.transcript, 2200)}\n"""`).join("\n\n")}`);
  }

  const bodyWords = Math.round(targetWords * 0.74);
  const ctaWords = Math.round(targetWords * 0.15);

  parts.push(`# PRESUPUESTO DE PALABRAS

El guion completo (un hook + body + CTA) tiene que dar **≈ ${targetWords} palabras**${blueprints.length ? " — la extensión del referente" : ""}. Repartición:

- Cada hook: 10 a 20 palabras. Van sueltos, no suman entre sí.
- Body: ≈ ${bodyWords} palabras en total, repartidas en los beats.
- CTA: ≈ ${ctaWords} palabras.

${blueprints.length ? `Cada beat del esqueleto trae su propio conteo — **respetalo beat por beat**. Si el beat 2 dice 40 palabras, tu beat 2 va de 35 a 45. Es el presupuesto que hace que el guion dure lo mismo que el anuncio que funcionó.\n\n` : ""}Antes de entregar: contá las palabras de cada campo, sumá hook + body + CTA, y comprobá que el total esté entre ${Math.round(targetWords * 0.9)} y ${Math.round(targetWords * 1.1)}. Si te pasaste, recortá — no entregues de largo esperando que alguien lo corte después. Reportá el conteo REAL en cada campo \`words\`.`);

  if (instruction && instruction.trim()) {
    const cur = current || {};
    parts.push(`# TAREA: AJUSTAR EL GUION QUE YA EXISTE

Este es el guion actual, con las ediciones a mano que ya le hicieron. Es el punto de partida
— no lo reescribas de cero.

HOOKS:
${(cur.hooks || []).map((h, i) => `${i + 1}. ${h.text}`).join("\n") || "(vacío)"}

BODY:
${(cur.body || []).map((b, i) => `${i + 1}. ${b.text}`).join("\n") || "(vacío)"}

CTA:
${cur.cta?.text || "(vacío)"}

## LO QUE HAY QUE CAMBIAR

"""
${instruction.trim()}
"""

Aplicá ese pedido y devolvé el guion COMPLETO. Todo lo que el pedido no menciona se queda
**exactamente igual** — misma redacción, palabra por palabra. Es un ajuste, no una
regeneración: si tocás cosas que nadie pidió, se pierde el trabajo de edición que ya había.

Lo que no cambia nunca, aunque el pedido no lo diga: la premisa del video, quién habla, y las
reglas de producto y de temas prohibidos.`);
  } else if (hooksOnly) {
    parts.push(`# TAREA: SOLO HOOKS NUEVOS

El body y el CTA ya están aprobados y NO se tocan — devolvelos exactamente como están abajo, con su conteo de palabras.

Body actual:
${(existing?.body || []).map((b, i) => `${i + 1}. ${b.text}`).join("\n") || "(vacío)"}

CTA actual:
${existing?.cta?.text || "(vacío)"}

Generá 5 hooks NUEVOS, distintos entre sí y distintos de estos que ya se descartaron:
${(existing?.previousHooks || []).map((h) => `- ${h}`).join("\n") || "(ninguno)"}`);
  } else {
    parts.push(`Escribí el guion ahora.`);
  }

  return parts.join("\n\n");
}

// Chequea las dos cosas que el schema no puede garantizar: 5 arquetipos
// distintos y el presupuesto de palabras. Devuelve el texto de corrección, o
// null si está todo bien.
// Coherencia hook↔cuerpo + presupuesto de palabras. La lógica vive en
// _lib/scriptChecks.js (funciones puras, testeadas con los tres fallos reales);
// acá solo se le pasa el contexto que necesita para el chequeo de listas.
export function validate(out, targetWords, { subjects = [] } = {}) {
  return checkScript(out, targetWords, { subjects });
}

export function measure(out) {
  // Adjuntamos la etiqueta legible del arquetipo acá para que el panel no tenga
  // que conocer la taxonomía — solo la pinta.
  const hooks = (out.hooks || []).map((h) => ({ ...h, label: archetypeLabel(h.archetype), words: countWords(h.text) }));
  const body = (out.body || []).map((b) => ({ ...b, words: countWords(b.text) }));
  const cta = { ...(out.cta || {}), words: countWords(out.cta?.text) };
  return { hooks, body, cta, words: measureWords({ hooks, body, cta }) };
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  }
  if (!process.env.BACKEND_URL || !process.env.BACKEND_SERVICE_KEY) {
    return res.status(500).json({ error: "Supabase env vars not configured" });
  }

  const {
    mode = "generate", companyId, memberId,
    variationId, transcript,
    slot = {}, targetWords: rawTarget, hooksOnly = false, existing = null,
    instruction = "", current = null,
    blueprints: providedBlueprints = [],
  } = req.body || {};

  if (!companyId) return res.status(400).json({ error: "Falta companyId" });

  try {
    await requireCompanyAccess(req, companyId);
  } catch (err) {
    return sendAuthError(res, err);
  }

  const sb = serviceClient();
  const usage = { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 };

  const bypass = await detectTeamBypass(req, sb);

  // El guionista está habilitado por empresa. Fuera de esas, lo usa el equipo de
  // Inforce y nadie más: generar gasta el pool de tokens de la cuenta, y un
  // cliente que aprieta "generar" sobre veinte slots se come la semana entera.
  //
  // El botón ya no se le muestra (`src/lib/guionista.js`), pero esconderlo no es
  // cerrarlo: la ruta sigue estando y esta es la que decide. `detectTeamBypass`
  // es el mismo "¿es del equipo?" que ya se usa para saltar los límites.
  if (!bypass && !empresaConGuionista(companyId)) {
    return res.status(403).json({ error: "El guionista no está habilitado para esta cuenta." });
  }

  if (!bypass && (await enforceCompanyTokenLimits(res, sb, companyId))) return;

  try {
    // ── Modo blueprint: una transcripción → un esqueleto, y se cachea ────────
    if (mode === "blueprint") {
      if (!transcript || !transcript.trim()) {
        return res.status(400).json({ error: "Falta transcript" });
      }
      const blueprint = await runBlueprint(transcript, usage);
      if (variationId) {
        const { error } = await sb
          .from("despliegue_variations")
          .update({ script_blueprint: blueprint })
          .eq("id", variationId);
        // No es fatal: el blueprint sirve igual para esta generación.
        if (error) console.error("[generate-slot-script] cache blueprint failed:", error);
      }
      await logUsage(sb, { companyId, memberId, ...usage, model: MODEL, context: { purpose: "blueprint", variationId: variationId || null } });
      return res.status(200).json({ ok: true, blueprint });
    }

    // ── Modo generate ───────────────────────────────────────────────────────
    const [voiceRes, companyRes, conceptRes, boardRes] = await Promise.all([
      sb.from("company_voice_profile").select("*").eq("company_id", companyId).maybeSingle(),
      sb.from("companies").select("name").eq("id", companyId).maybeSingle(),
      slot.concept_id
        ? sb.from("despliegue_concepts").select("name, description, execution").eq("id", slot.concept_id).maybeSingle()
        : Promise.resolve({ data: null }),
      sb.from("despliegue_boards").select("id").eq("company_id", companyId).eq("active", true).maybeSingle(),
    ]);

    const voice = voiceRes.data || null;
    const product = findProduct(voice, slot.product_id, slot.producto);
    const angle = findAngle(product, slot.angulo);

    // Guiones propios que ya ganaron, del mismo producto o al menos del mismo
    // ángulo. Es la señal de calidad más fuerte que tenemos: son anuncios reales
    // de esta marca con rendimiento medido.
    const winners = await loadWinners(sb, boardRes.data?.id, slot);

    const systemPrompt = buildSystemPrompt({
      companyName: companyRes.data?.name,
      companyCtx: buildCompanyContext(voice, product?.id || slot.product_id),
      voice,
      product,
    });

    const targetWords = Math.max(40, Math.round(Number(rawTarget) || DEFAULT_TARGET_WORDS));

    const userMsg = buildUserMessage({
      slot, blueprints: providedBlueprints, winners,
      concept: conceptRes.data, angle, targetWords, hooksOnly, existing,
      instruction, current,
    });

    const messages = [{ role: "user", content: userMsg }];
    const callBody = {
      max_tokens: 4000,
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      tools: [SCRIPT_TOOL],
      tool_choice: { type: "tool", name: SCRIPT_TOOL.name },
    };

    let data = await callClaude({ ...callBody, messages });
    addUsage(usage, data.usage);
    let block = (data.content || []).find((c) => c.type === "tool_use");
    if (!block) throw new Error("El modelo no devolvió el guion.");
    let out = block.input;
    // De qué trata la lista, si el cuerpo enumera: el producto y el ángulo. Con
    // esto se detecta un hook que promete "N razones" sobre OTRA cosa.
    const subjects = [slot.producto, angle?.title || slot.angulo].filter(Boolean);

    // Una sola ronda de corrección — acotada a propósito: si sigue mal después
    // de una, devolvemos lo que hay con el aviso, en vez de quemar tokens.
    //
    // El turno del assistant trae un `tool_use`, así que el mensaje siguiente
    // TIENE que abrir con un `tool_result` que lo referencie: sin eso la API
    // responde 400 y se cae toda la generación en vez de corregirse.
    const problems = validate(out, targetWords, { subjects });
    let repaired = false;
    if (problems) {
      try {
        const retry = await callClaude({
          ...callBody,
          messages: [
            ...messages,
            { role: "assistant", content: data.content },
            {
              role: "user",
              content: [
                { type: "tool_result", tool_use_id: block.id, content: "Guion recibido. Revisado: necesita ajustes." },
                { type: "text", text: `Encontré estos problemas:\n\n${problems}\n\nDevolvé el guion COMPLETO corregido. Mantené intacto todo lo que ya estaba bien — solo tocá lo que se señala.` },
              ],
            },
          ],
        });
        addUsage(usage, retry.usage);
        const retryBlock = (retry.content || []).find((c) => c.type === "tool_use");
        if (retryBlock?.input?.hooks?.length) { out = retryBlock.input; repaired = true; }
      } catch (e) {
        // La corrección es una mejora, no un requisito: si falla, devolvemos el
        // primer guion con su aviso en vez de perder la generación entera.
        console.warn("[generate-slot-script] ronda de corrección falló:", e?.message);
      }
    }

    const measured = measure(out);
    const remaining = validate(out, targetWords, { subjects });

    await logUsage(sb, {
      companyId, memberId, ...usage, model: MODEL,
      context: { purpose: "slot_script", productId: slot.product_id || null, angulo: slot.angulo || null, hooksOnly, repaired },
    });

    return res.status(200).json({
      ok: true,
      ...measured,
      promise: out.promise || "",
      notes_for_creator: out.notes_for_creator || "",
      targetWords,
      winnersUsed: winners.length,
      // El panel lo muestra como aviso suave; el guion sirve igual.
      warning: remaining || null,
      model: MODEL,
    });
  } catch (err) {
    console.error("[generate-slot-script]", err?.message || err);
    // Aunque falle, logueamos lo que se llegó a gastar.
    await logUsage(sb, { companyId, memberId, ...usage, model: MODEL, context: { purpose: "slot_script", failed: true } });
    return res.status(500).json({ error: err?.message || "error" });
  }
}

// Anuncios propios producidos con mejor rendimiento. `transcript` de una
// variation `produced` es el guion que se filmó (lo escribe el propio pipeline
// al mover el slot a campaña), y `dims`/`metrics` vienen del Scorecard.
export async function loadWinners(sb, boardId, slot) {
  if (!boardId) return [];
  try {
    const { data: concepts } = await sb
      .from("despliegue_concepts").select("id").eq("board_id", boardId).eq("archived", false);
    const ids = (concepts || []).map((c) => c.id);
    if (!ids.length) return [];

    const { data: rows } = await sb
      .from("despliegue_variations")
      .select("name, transcript, metrics, dims")
      .in("concept_id", ids)
      .eq("source_type", "produced")
      .limit(200);

    const withScript = (rows || []).filter((r) => String(r.transcript || "").trim().length > 120);
    if (!withScript.length) return [];

    const roas = (r) => parseFloat(String(r.metrics?.roas ?? "").replace(",", ".")) || 0;
    const rank = (r) => (r.metrics?.rendimiento === "alto" ? 2 : r.metrics?.rendimiento === "medio" ? 1 : 0);
    const sameProduct = (r) => slot.producto && r.dims?.producto === slot.producto;
    const sameAngle = (r) => slot.angulo && r.dims?.angulo === slot.angulo;

    // Mismo producto primero, después mismo ángulo, y dentro de cada grupo por
    // rendimiento y ROAS. Así el ejemplo es siempre lo más cercano disponible.
    const scored = withScript
      .map((r) => ({ r, tier: (sameProduct(r) ? 4 : 0) + (sameAngle(r) ? 2 : 0) }))
      .filter((x) => x.tier > 0 || rank(x.r) === 2)
      .sort((a, b) => b.tier - a.tier || rank(b.r) - rank(a.r) || roas(b.r) - roas(a.r))
      .slice(0, 2);

    return scored.map(({ r }) => ({
      transcript: r.transcript,
      tag: [r.dims?.angulo, r.metrics?.rendimiento ? `rendimiento ${r.metrics.rendimiento}` : null, roas(r) ? `ROAS ${roas(r)}` : null]
        .filter(Boolean).join(" · "),
    }));
  } catch (e) {
    console.warn("[generate-slot-script] loadWinners failed:", e?.message);
    return [];
  }
}
