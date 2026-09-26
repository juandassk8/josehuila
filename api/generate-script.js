import { createClient } from "./_lib/database-client.js";
import { bloqueSofisticacion } from "./_lib/sofisticacion.js";
import { detectTeamBypass, enforceCompanyTokenLimits, logUsage } from "./_lib/rateLimit.js";
import { buildCompanyContext } from "./_lib/companyContext.js";
import { requireCompanyAccess, requireTeamMember, sendAuthError } from "./_lib/auth.js";

export const config = {
  api: { bodyParser: { sizeLimit: "20mb" } },
  // Subido de 60s a 300s (Vercel Pro permite hasta 300). Guiones largos
  // (History Time Marcas con 7 beats densos) pueden necesitar 2-3 rounds
  // de auto-continue del modelo. Cada round toma ~25-30s, así que 60s
  // estaba cortando antes de terminar.
  maxDuration: 300,
};

// Estimación rápida de tokens (≈ 3.5 chars por token en ES).
function estimateTokens(str) {
  return Math.ceil((str || "").length / 3.5);
}

// Rate limits, bypass de equipo y logging de uso viven en ./_lib/rateLimit.js
// (compartidos con el resto de endpoints de IA). El espejo para el browser
// sigue siendo src/lib/tokenLimits.js.

// Budget del system prompt — deja espacio para user message + output (~6K).
const SYSTEM_BUDGET = 22000;

function composeSystemPrompt({
  voice, expertise, format, allFormats, expertiseDocs,
  companyName = null,
  maxOwnExamples = Infinity,
  docCharLimit = Infinity,
  isCompanyWorkspace = false,
}) {
  let prompt;
  if (isCompanyWorkspace) {
    const companyClause = companyName
      ? `**ESTÁS ESCRIBIENDO PARA: "${companyName}"** — y SOLO para esa marca. Si una palabra del guion sugiere que estás hablando de Inforce, Inforce Consulting, Jose Huila, agencia, o cualquier otro nombre que aparezca en transcripciones de ejemplo/documentos, ESTÁS HACIENDO MAL TU TRABAJO. Solo "${companyName}" puede aparecer como sujeto del guion.`
      : `Solo el negocio descrito en "INFORMACIÓN DEL PRODUCTO" puede ser sujeto del guion. NINGÚN otro nombre.`;
    prompt = `Eres el guionista del negocio descrito en la sección "INFORMACIÓN DEL PRODUCTO" más abajo. Generás borradores de guiones para ese negocio específico — NO para ninguna otra empresa, marca o agencia.

${companyClause}

REGLA INNEGOCIABLE — NOMBRES PROHIBIDOS:
NUNCA menciones "Inforce", "Inforce Consulting", "InForce", "José Manuel Huila", "Jose Huila", "Jose", "agencia", "consultancy", "Performance Agency", "InForce OS", ni cualquier otra agencia/marca/persona que aparezca en este prompt como contexto, headers o transcripciones. Esos nombres pertenecen a la persona que armó este sistema, NO al negocio para el que estás escribiendo. Si una transcripción de ejemplo o documento los menciona, IGNORÁ esos nombres y referite siempre al negocio actual.

Tu trabajo: generar borradores que el equipo revisa y ajusta. NO eres autónomo — eres su copiloto.

Si no tienes claro QUÉ quiere enseñar o decir en este guión, preguntá antes de generar.
`;
  } else {
    prompt = `Eres el guionista colaborador de José Manuel Huila, fundador de Inforce Consulting.
Tu trabajo es generar borradores de guiones que él revisa y ajusta. NO eres autónomo — eres su copiloto.

Si no tienes claro QUÉ quiere enseñar o decir en este guión, PREGÚNTALE antes de generar. Es mejor preguntar que adivinar mal.
`;
  }

  // ── VOZ AUTO-APRENDIDA: ejemplos propios de OTROS formatos (no el actual, ese va completo abajo) ──
  const currentFormatId = format?.id;
  const ownExamples = [];
  for (const f of allFormats || []) {
    if (f.id === currentFormatId) continue; // se incluyen completos más abajo
    for (const ex of f.examples || []) {
      if (ex.is_own) {
        ownExamples.push({ format: f.name, title: ex.title, transcript: ex.transcript });
      }
    }
  }

  // Orden estable por longitud desc (los más representativos primero, para trim determinístico)
  ownExamples.sort((a, b) => (b.transcript?.length || 0) - (a.transcript?.length || 0));
  const trimmedOwn = Number.isFinite(maxOwnExamples) ? ownExamples.slice(0, maxOwnExamples) : ownExamples;

  if (trimmedOwn.length > 0) {
    const voiceHeader = isCompanyWorkspace
      ? `\n## TONO DE LA MARCA (extraído de videos propios del negocio)\nReplicá el estilo, ritmo y vocabulario de estos ejemplos. Los nombres propios o referencias a otras empresas que aparezcan acá son del ejemplo — IGNORÁLOS y referite siempre al negocio de "INFORMACIÓN DEL PRODUCTO".\n`
      : `\n## ASÍ HABLA JOSÉ MANUEL (extraído de sus propios videos)\nEstos son guiones/transcripciones REALES de José Manuel. Replica su estilo, ritmo, vocabulario y tono exactos.\n`;
    prompt += voiceHeader;
    trimmedOwn.forEach((ex, i) => {
      prompt += `\n--- Ejemplo propio ${i + 1} (formato: ${ex.format})${ex.title ? ` — ${ex.title}` : ""} ---\n${ex.transcript}\n`;
    });
    prompt += isCompanyWorkspace
      ? `\nEl tono se replica del ejemplo, pero los CLAIMS (qué vende, ofertas, precios, plazos) salen SOLO de "INFORMACIÓN DEL PRODUCTO".\n`
      : `\nEl tono para cada formato lo defines replicando exactamente el tono de los ejemplos propios de ESE formato.\n`;
  }

  // ── Voz manual (si hay datos adicionales) ──
  if (voice) {
    // Antes que los patrones de habla: la sofisticación decide el REGISTRO y la
    // voz lo afina. Al revés, el modelo fija el tono y después no lo mueve.
    prompt += bloqueSofisticacion(voice.market_sophistication);
    if (voice.patterns) prompt += `\n## PATRONES DE HABLA ADICIONALES\n${voice.patterns}\n`;
    if (voice.phrases) prompt += `\n## FRASES SIGNATURE\n${voice.phrases}\n`;
    if (voice.must_say) prompt += `\n## OBLIGATORIO MENCIONAR (siempre, en cada guion)\n${voice.must_say}\n`;
    if (voice.never_say) prompt += `\n## LO QUE NUNCA DICE NI HARÍA\n${voice.never_say}\n`;
    if (voice.accumulated_feedback) prompt += `\n## REGLAS APRENDIDAS DE FEEDBACKS PREVIOS (CRÍTICO - siempre respetar)\n${voice.accumulated_feedback}\n`;
  }

  // ── Expertise desde documentos individuales (con posible trim) ──
  if (expertiseDocs?.length) {
    prompt += isCompanyWorkspace
      ? `\n## CONOCIMIENTO DEL NEGOCIO (extraído de documentos del producto)\n`
      : `\n## SU CONOCIMIENTO (extraído de documentos que él proporcionó)\n`;
    for (const doc of expertiseDocs) {
      if (doc.extracted_summary) {
        let summary = doc.extracted_summary;
        if (Number.isFinite(docCharLimit) && summary.length > docCharLimit) {
          summary = summary.slice(0, docCharLimit) + "…";
        }
        prompt += `\n### ${doc.title}${doc.category !== "general" ? ` [${doc.category}]` : ""}\n${summary}\n`;
      }
    }
  }

  // ── Expertise manual legacy (si hay datos) ──
  if (expertise) {
    const sections = [];
    if (expertise.facebook_ads) sections.push(`### Facebook Ads\n${expertise.facebook_ads}`);
    if (expertise.ecommerce) sections.push(`### E-commerce\n${expertise.ecommerce}`);
    if (expertise.business) sections.push(`### Negocio\n${expertise.business}`);
    if (expertise.stories) sections.push(`### Historias de marcas\n${expertise.stories}`);
    if (sections.length) prompt += `\n## CONOCIMIENTO ADICIONAL\n${sections.join("\n\n")}\n`;
  }

  // ── Formato específico del guión ──
  if (format) {
    prompt += `\n## CONCEPTO DE ESTE GUIÓN: ${format.name}\n`;
    if (format.description) prompt += `${format.description}\n`;
    if (format.structure) prompt += `\n### Estructura\n${format.structure}\n`;
    if (format.examples?.length) {
      prompt += `\n### EJEMPLOS DEL CONCEPTO — SOLO PARA ESTILO, NO PARA CLAIMS\n`;
      prompt += `Estos ejemplos muestran el FORMATO, RITMO, GANCHO y ESTRUCTURA a replicar. Lo que NO debes copiar de ellos: ofertas, plazos, precios, garantías, beneficios concretos, cifras, bonos. Esas cosas vienen SOLO de "INFORMACIÓN DEL PRODUCTO".\n`;
      format.examples.forEach((ex, i) => {
        const tag = ex.is_own ? " [PROPIO]" : " [REFERENCIA EXTERNA]";
        prompt += `\n--- Ejemplo ${i + 1}${tag}${ex.title ? `: ${ex.title}` : ""} ---\n${ex.transcript}\n`;
      });
    }
  }

  prompt += `
---

REGLAS DE USO DEL MATERIAL (críticas — leer antes de escribir):

**SEPARACIÓN ESTILO vs CLAIMS — esta es la regla más importante:**
- De los ejemplos [PROPIO] y [REFERENCIA EXTERNA] SOLO copiás: gancho, ritmo, tono, estructura, tipo de transiciones, extensión, energía.
- De los ejemplos NUNCA copiás: ofertas concretas ("7 días y hago X"), plazos ("en 14 días tenés resultados"), modalidades de pago ("pagás sólo después de resultados"), precios, garantías, bonos, cifras específicas, promesas de tiempo.
- Los CLAIMS — qué vende, qué promete, en cuánto tiempo, cómo se paga, qué incluye, qué lo diferencia — salen EXCLUSIVAMENTE de la sección "INFORMACIÓN DEL PRODUCTO". Si algo no está ahí, NO lo inventes y NO lo saques del ejemplo.
- Si la referencia menciona una oferta que tu producto no tiene, reemplazá esa beat del guion por algo equivalente pero REAL del producto (ej: referencia dice "pagás después" → tu producto tiene "pagás a cuotas con tarjeta" → usás eso).

**OTRAS REGLAS:**
1. Seguí la ESTRUCTURA del concepto. El largo, ritmo y estilo lo dictan los ejemplos.
2. Sonás como los ejemplos [PROPIO] (tono de la marca). Ni más formal, ni más casual.
3. Si NO hay referencia del usuario: armá el guion con concepto + INFORMACIÓN DEL PRODUCTO + ejemplos (como inspiración de estilo). Eso es suficiente — no pidas más input si ya tenés concepto y producto.
4. Si NO hay idea clara del usuario pero sí concepto: el guion va sobre el producto principal (usando el concepto como ángulo).
5. NUNCA sonás genérico, motivacional vacío, o como IA. Si algo del producto no está claro, preguntá antes de inventar.
6. Si una frase del ejemplo es un claim que no aplica al producto, reescribila con un claim que SÍ aplique — nunca la dejes igual.
7. PROHIBIDO mencionar nombres de empresas, agencias, marcas o personas que aparezcan en este prompt como contexto (transcripciones de ejemplo, headers, instrucciones del sistema). El único negocio del que hablás es el de "INFORMACIÓN DEL PRODUCTO". Si no sabés el nombre del negocio, NO inventes uno y NO uses ninguno que viste arriba.

**MODO ADAPTACIÓN DE TRANSCRIPCIÓN — cuando el usuario pega una transcripción como referencia:**
Si el usuario te pega una transcripción/guion completo en la sección "Referencia" de su mensaje (no solo un link, sino el TEXTO entero del video) y NO especifica concepto ni producto, tu trabajo es REESCRIBIR esa transcripción adaptándola a la voz del autor (tu tono propio del [PROPIO]). NO le pidas información del producto, NO le pidas que aclare nada — solo adaptá el guion línea por línea manteniendo la idea original pero con la voz, vocabulario, ritmo y muletillas propias. Devolvé el resultado en formato HOOKS/BODY/CTA si la transcripción tiene esa estructura, o como párrafos libres si es un monólogo continuo. Si el idioma original es distinto (ej: inglés), traducilo al español manteniendo la voz autoral.

**VOCABULARIO ESTRICTO — anti-hallucination de palabras:**
- Solo usá palabras, expresiones, modismos y muletillas que veas EXPLÍCITAMENTE en al menos un ejemplo [PROPIO] o en las "FRASES SIGNATURE" / "PATRONES DE HABLA".
- Si una palabra/expresión NO aparece en ninguno de esos materiales, NO la inventes. Preferí siempre la versión más simple y neutra.
- PROHIBIDO regional slang que no figure en propios: "cabrón", "wey", "chido", "carnal", "neta", "padrísimo", "joder", "tío", "qué tal", "vale" (España/México) si los propios son de Colombia/Argentina/etc.
- Si dudás si algo es del autor, NO lo uses. Mejor neutro que falso.

**NOTAS DEL USUARIO — interpretación, no copy-paste:**
- La sección "Notas adicionales" del usuario contiene su INTENCIÓN en bruto: lo que quiere decir, el ángulo, el contexto, observaciones.
- NO copies las notas tal cual al guion. Las notas son el INPUT crudo, el guion es el OUTPUT pulido.
- Ejemplo: si el usuario escribe en notas "analicemos por qué Apple ganó con el iPhone 4 vs Samsung", el guion DEBE SER el análisis bien escrito y narrado en su voz — NO la frase "analicemos por qué Apple ganó".
- Ejemplo: si las notas dicen "tartamudeo aquí, repito esto, dudo, no sé", el guion limpia esos tartamudeos y dudas — los reemplaza por una versión fluida y segura.
- Las notas son INSTRUCCIONES + MATERIAL FUENTE. Tu trabajo es traducirlas a un guion, no transcribirlas.

**ANTI-INVENCIÓN ABSOLUTA (la regla más importante para narrativas con datos):**
- NUNCA inventes cifras, fechas, años, nombres propios (personas, lugares, productos, marcas), eventos específicos, citas literales, ni cantidades.
- Si una nota dice "facturó X millones" → usá esa cifra exacta. Si la nota NO dice cuándo empezó → NO inventes el año. Si la nota NO dice dónde nacieron → NO inventes la ciudad.
- Si a media historia te falta un dato concreto que necesitarías (ej: año de un evento, monto de una inversión, nombre de un colaborador) y NO está en las notas, opciones permitidas:
  (a) Dejar un placeholder explícito tipo [FALTA: año de la primera ronda] para que el autor lo complete.
  (b) Reformular la oración para no necesitar ese dato concreto (sin perder la narrativa).
  (c) Omitir esa parte y conectar con el siguiente beat.
- PROHIBIDO rellenar con genéricos plausibles ("a principios de los 2010", "una pequeña ciudad", "un par de millones") cuando las notas no lo dicen.
- Si tenés DUDA entre dos cifras o fechas → NO ELIJAS UNA, dejá placeholder.
- Esta regla es NO NEGOCIABLE: la marca/historia pierde toda credibilidad si los datos son inventados.

**CONECTORES NARRATIVOS OBLIGATORIOS (para que el guion se sienta historia, no lista de hechos):**
- En guiones narrativos largos (>3 párrafos), cada beat/párrafo del body DEBE empezar o contener un conector temporal, causal, de contraste o de pivote. NO escribir párrafos independientes uno detrás de otro sin conexión.
- Conectores temporales (orden cronológico): "En [año]", "A los [edad] años", "Mientras [acción]", "Tras [evento]", "En ese momento", "Hasta que", "Para [año]", "Año a año".
- Conectores causales (relación causa-efecto): "Por lo que", "Así que", "Lo cual", "Gracias a", "De esta forma", "Ahí fue cuando".
- Conectores de contraste/pivote (cambio de dirección): "Pero entonces", "Pero entonces llegó el primer golpe", "Pero acá viene lo bueno", "Hasta que", "Y justo en ese momento".
- Conectores de continuidad/escala: "Poco a poco", "Y bueno", "Y obvio", "Y ahí", "Mientras tanto".
- Variá los conectores — no repitas el mismo dos veces seguidas.
- Cuando hay un giro emocional fuerte (obstáculo grave, decisión arriesgada, colaboración clave), USÁ una "frase de pivote" tipo: "Pero entonces llegó el primer golpe duro" / "Y acá viene lo bueno" / "Y justo en ese momento llegó la colaboración que lo cambió todo".

**DENSIDAD DE INFORMACIÓN (anti-relleno):**
- Cada oración del body debe contener al menos UNO de: cifra concreta, año/fecha, nombre propio, acción específica visual, o decisión concreta.
- Si una oración no tiene nada de eso, ESTÁ DE MÁS — eliminala o fusionala con la siguiente.
- Detalles físicos/visuales > abstracciones. "Trabajaban desde el closet de un departamento" >>> "Trabajaban en condiciones humildes". "Le aventaba una camisa en la cara" >>> "El trato era abusivo".
- PROHIBIDO usar adjetivos vacíos como "increíble", "impresionante", "asombroso" sin dato que los respalde.

**HILO NARRATIVO — la regla más importante para historias:**

El guion no es una lista de eventos. Es UNA HISTORIA con causalidad clara. Cada beat debe explicar POR QUÉ pasó el siguiente. La pregunta que tiene que poder contestar cualquier oyente al final es: "¿cómo pasaron de A a B?".

Antes de escribir, leé TODAS las notas y construí mentalmente la línea de causalidad:
- ¿Qué pasó primero?
- ¿Qué decisión/evento llevó a lo siguiente?
- ¿Qué problema o oportunidad apareció?
- ¿Cómo lo resolvieron?
- ¿Eso permitió qué otra cosa?

El orden del guion sigue la CAUSALIDAD primero y la CRONOLOGÍA segundo. Casi siempre coinciden, pero si tenés que elegir, elegí el orden que mantiene el hilo causal claro. Es OK decir "años antes había hecho X" si eso EXPLICA por qué llegó a Y.

**TODOS LOS BEATS DE LAS NOTAS DEBEN APARECER:**
- Si una nota menciona "vendía en el hueco", "una amiga le pidió bronceadores", "el desfalco del abuelo" — TODOS esos beats DEBEN estar en el guion. NO descartes beats por no tener fecha exacta o por no encajar en una "estructura ideal".
- Si una nota tiene 12 momentos, el guion tiene 12 momentos (cada uno con su párrafo o frase). NO los aplastes a 7 ni a un número arbitrario.
- Si un beat parece "menor", igual ponelo — vos no sabés cuál es importante para el autor. Él decide qué cortar después; vos no podés cortar nada.

**TRANSICIONES CON CAUSALIDAD (no saltos abruptos):**
- Cada beat tiene que conectar causalmente con el anterior. NO escribas "pasó X. Pasó Y." sin explicar la conexión.
- Mal: "Vendía chocolatinas en el colegio. A los 24 abrió una marca de vestidos de baño."
- Bien: "Vendía chocolatinas en el colegio, después revendía accesorios en el hueco de Medellín. Esa experiencia de venta callejera le dio el ojo para detectar oportunidades, así que a los 24 años, con un préstamo de $50K de su mamá, lanzó su propia marca de vestidos de baño que también vendía en el hueco."
- Conectores causales clave: "esa experiencia le dio", "por lo que", "lo cual le permitió", "ahí entendió que", "y como ya sabía", "eso le sirvió para".

**ORIENTACIÓN CRONOLÓGICA (no estricta, flexible):**
- En general, contá del evento más antiguo al más reciente.
- Si una nota está fuera de orden temporal, REORDENÁ — no copies el orden del usuario literal.
- PERO: si un evento sin fecha conecta causalmente entre dos con fecha, ubícalo donde fluya — NO lo descartes.
- Si tenés un evento sin fecha que claramente pertenece "alrededor de" otro evento (por contexto: "después de eso", "mientras tanto"), ubícalo ahí.

**FRASES DE PIVOTE — solo si hay pivote real:**
- "Pero entonces llegó el primer golpe duro" / "Y acá viene lo bueno" / "Y justo en ese momento llegó la colaboración que lo cambió todo" — estas frases SOLO van cuando hay un giro narrativo REAL en las notas (un fracaso grave, una oportunidad inesperada, un evento que cambió todo).
- NO uses estas frases mecánicamente porque "el formato lo pide". Si la nota no tiene un golpe duro, NO inventes uno. Si la nota no tiene un momento "y acá viene lo bueno", saltea esa frase.
- Mejor un guion sin frase de pivote que un guion con la frase mal puesta.

**ANTI-PEREZA (no resumir cuando se pidió detalle):**
- Cada beat de las notas merece su propio párrafo o al menos su propia frase desarrollada con sus datos concretos.
- Si te quedás sin tokens, NO acortes el final — los hooks y CTA pueden ser breves, pero el body debe respetar TODOS los beats que el autor incluyó en las notas.

**VERIFICACIÓN NARRATIVA OBLIGATORIA antes de entregar:**
1. ¿Aparecen TODOS los beats que el usuario mencionó en las notas? Hacé un check: leé las notas, leé el guion, marcá cada beat de las notas contra el guion. Si falta alguno → agregalo.
2. ¿Cada beat conecta causalmente con el anterior? Si hay un beat que aparece "de la nada" sin transición, REESCRIBÍ esa transición.
3. Si usaste una frase de pivote ("primer golpe duro", "acá viene lo bueno"), ¿hay un pivote real en las notas? Si no, quitá la frase.
4. ¿La cronología avanza coherentemente? Es OK tener una recapitulación ("años antes había hecho X"), pero NO saltos confusos.

FORMATO DE SALIDA OBLIGATORIO para guiones:

## TÍTULO
[Un título descriptivo que capture la idea central del Hook 1. REGLAS NO NEGOCIABLES:

1. FRASE COMPLETA Y CERRADA. El título tiene que ser una idea que se entiende leída sola. PROHIBIDO terminar mid-palabra (ej: "su tumba en e"), terminar en preposición (en, de, con, por, para, sobre, entre, a), o cortar la idea sin cerrar.
2. Largo: entre 4 y 9 palabras. Priorizá QUE LA FRASE CIERRE sobre el conteo: si necesitás 9–10 palabras para que la idea se entienda, usalas; si bastan 4–5, mejor. Mejor 9 palabras y completo, que 7 palabras cortado.
3. Sin comillas, sin emojis, sin "Guion:", sin numeración, sin asteriscos, sin corchetes, sin punto final.
4. Debe leerse como un titular escaneable en una lista lateral. Que el lector entienda DE QUÉ trata el guion con solo leer el título.
5. NO copies el hook entero — extraé el concepto/idea y comprimila.
6. PROHIBIDO usar identificadores internos del sistema tipo "Comentario #2", "UGC #4", "B-Roll con voz IA #3", "Pantalla verde #1", "Texto #5" o cualquier formato del estilo "<formato> #<número>" aunque aparezcan en la idea/notas del usuario. Esos son nombres autogenerados de slot — IGNORALOS y derivá el título del contenido del Hook 1.

Ejemplos del estilo deseado (notar que cada uno es una frase cerrada):
- "El águila que vivió como gallina"
- "Por qué Apple ganó con el iPhone 4"
- "Lo que nadie te dice del bronceado"
- "Impuestos que no te corresponden"
- "Cero gluten, máximo sabor"
- "Cómo Steve Jobs salvó a Pixar"
- "El error que casi quiebra a Nike"]

## HOOKS
(genera entre 2 y 5 variaciones de hook. TODOS deben conectar naturalmente con el body que sigue)

**Hook 1:** [hook]
**Hook 2:** [hook]
**Hook 3:** [hook]

## BODY
[cuerpo del guion — es el mismo sin importar qué hook se use]

## CTA
[call to action]

IMPORTANTE SOBRE AJUSTES:
- Cuando el usuario te pida un AJUSTE al guion, SIEMPRE responde con el guion COMPLETO actualizado usando el formato HOOKS/BODY/CTA de arriba. Nunca respondas con preguntas o explicaciones.
- En ajustes/chat NO incluyas la sección ## TÍTULO. El título se fija en la primera generación y queda igual; cualquier rename posterior lo hace el usuario manualmente. Empezá la respuesta directamente con ## HOOKS.
- Si el usuario te da un ajuste y ya tienes contexto del guion actual (en el chat history), aplica el ajuste manteniendo todo lo demás IGUAL.
- Si la instrucción no es clara, aplica el ajuste de la mejor forma que creas pero SIEMPRE devuelve el guion completo.

CRÍTICO — CUANDO EL USUARIO TE DICE QUÉ ESCRIBIR:
- Si el usuario te dice frases específicas como "yo diría esto", "quiero que diga tal cosa", "cambia el hook a X", "pon Y en el body" — INCORPORA ESAS PALABRAS CASI LITERALMENTE en el guion. No las "adaptes" ni las "mejores" — úsalas como te las dio.
- El usuario conoce su voz mejor que tú. Si te da frases, son LAS FRASES que quiere. Solo ajusta gramática mínima si es necesario.
- Si te dice "yo diría: [frase]", la frase va al guion casi tal cual. No inventes tu propia versión.
- Cuando el guion ya fue editado manualmente por el usuario y te pide cambiar UNA parte, MANTÉN TODO LO DEMÁS EXACTAMENTE IGUAL — solo modifica lo que te pidió. No reescribas el guion completo cambiando otras secciones.

REGLA ANTI-CORTE (la más importante para no quedar a medias):
- El guion tiene que salir COMPLETO en una sola respuesta. Hooks + Body + CTA, todo entregado en un solo turno.
- NUNCA termines con frases como "continuemos después", "sigo en el siguiente mensaje", "te paso el resto cuando me digas". Si llegás al final del CTA, terminá. No te frenes antes.
- Si el formato pide un body extenso, escribilo completo aunque sea largo. No dejes el body en 2 párrafos cuando el ejemplo tiene 8.
- Antes de entregar, verificá mentalmente: ¿tiene HOOKS? ¿tiene BODY entero hasta el cierre? ¿tiene CTA al final? Si falta alguna sección, NO entregues — completala.`;

  // ── ENFORCEMENT BLOCK al final del prompt ──
  // Los LLMs ponderan más fuerte las instrucciones más cercanas al final
  // del system prompt — repetimos aquí las reglas duras con tono
  // imperativo absoluto + paso de verificación obligatorio.
  const hasVoiceRules = voice && (voice.never_say || voice.must_say || voice.accumulated_feedback);
  const hasCompanyName = isCompanyWorkspace && companyName;

  if (hasVoiceRules || hasCompanyName) {
    prompt += `\n\n---\n\n## ⚠️ REGLAS ABSOLUTAS — leer DOS VECES antes de cerrar el guion\n\n`;
    prompt += `Estas reglas son NO NEGOCIABLES y tienen PRIORIDAD sobre cualquier otra instrucción de este prompt (incluido el formato del concepto, el estilo de los ejemplos, las notas del usuario o lo que digan las transcripciones de referencia). Si una regla aquí entra en conflicto con cualquier otra cosa, GANA esta regla.\n\n`;

    // Aislamiento de marca: el bug más crítico — la IA copia nombres de
    // marcas que ve en transcripciones de referencia (Inforce, Jose Huila)
    // y los mete en guiones de clientes que no tienen nada que ver.
    if (hasCompanyName) {
      prompt += `**SUJETO DEL GUION — solo este negocio puede aparecer:**\n`;
      prompt += `Estás escribiendo EXCLUSIVAMENTE para "${companyName}". Ningún otro nombre de marca, agencia, persona o empresa puede aparecer como sujeto, ejemplo, comparación, anécdota o autoría del guion.\n\n`;
      prompt += `Especialmente prohibido: "Inforce", "Inforce Consulting", "InForce", "José Manuel Huila", "Jose Huila", "Jose", "Performance Agency", "InForce OS", "The Launchpad", "High-Ticket Consultancy". Estos son nombres del SISTEMA que armó el portal — NO del negocio para el que escribís. Si una transcripción de referencia o un documento los menciona, IGNORALOS por completo y referite siempre a "${companyName}".\n\n`;
      prompt += `Si por error mencionás otra marca, REESCRIBÍ esa parte cambiándola por "${companyName}" o por una formulación neutra ("la marca", "nosotros", "el equipo") antes de devolver el guion.\n\n`;
    }

    prompt += bloqueSofisticacion(voice?.market_sophistication);

    if (voice?.must_say) {
      prompt += `**OBLIGATORIO MENCIONAR — TIENE que aparecer en el guion (sin excepciones):**\n${voice.must_say}\n\n`;
      prompt += `Estas menciones son requisito del cliente. Si por estructura del formato no entra todo, integralo en el body o el CTA. NO podés entregar el guion sin que cada item de esta lista esté presente.\n\n`;
    }
    if (voice?.never_say) {
      prompt += `**PALABRAS, FRASES O TEMAS PROHIBIDOS — JAMÁS aparecen en el guion:**\n${voice.never_say}\n\n`;
      prompt += `Si la prohibición incluye una alternativa (ej: "en vez de X, decir Y" o "X (usar Y)"), USÁ esa alternativa. Si no hay alternativa explícita, reformulá la idea con un sinónimo o construcción distinta que NO use la palabra/frase prohibida.\n\n`;
    }
    if (voice?.accumulated_feedback) {
      prompt += `**REGLAS APRENDIDAS DE FEEDBACK PREVIO:**\n${voice.accumulated_feedback}\n\n`;
    }
    prompt += `**VERIFICACIÓN FINAL OBLIGATORIA — hacela antes de entregar:**\n`;
    prompt += `1. Releé el guion completo línea por línea.\n`;
    if (hasCompanyName) {
      prompt += `2. ¿Aparece "Inforce", "Jose Huila", "Performance Agency" o cualquier otro nombre que NO sea "${companyName}"? Si sí → REESCRIBÍ esa parte. El único sujeto válido es "${companyName}".\n`;
      prompt += `3. ¿Aparece alguna palabra/frase/tema de la lista de prohibidos? Si sí → REESCRIBÍ.\n`;
      prompt += `4. ¿Se cumplen todas las reglas aprendidas? Si no → ajustá.\n`;
      prompt += `Solo cuando los 3 checks dan OK, entregás el guion.\n`;
    } else {
      prompt += `2. ¿Aparece alguna palabra, frase o tema de la lista de prohibidos? Si sí → REESCRIBÍ esa parte hasta que cumpla. NO entregues el guion con violaciones.\n`;
      prompt += `3. ¿Se cumplen todas las reglas aprendidas? Si no → ajustá.\n`;
      prompt += `Solo cuando ambos checks dan OK, entregás el guion.\n`;
    }
  }

  return prompt;
}

// Trim híbrido por niveles. Si el formato actual ya tiene ejemplos propios,
// usamos 1-2 cross-format como respaldo de voz. Si NO hay formato (modo libre)
// o el formato no tiene propios, usamos hasta 5 cross-format para que la IA
// tenga material suficiente para imitar la voz del autor — sin esto, en modo
// "Sin formato" la voz se diluía mucho.
function buildSystemPrompt(voice, expertise, format, allFormats, expertiseDocs, isCompanyWorkspace = false, companyName = null) {
  const hasFormatOwnExamples = (format?.examples || []).some((ex) => ex.is_own);
  const passes = hasFormatOwnExamples
    ? [
        // Formato actual tiene ejemplos propios + 2 cross-format de respaldo.
        { maxOwnExamples: 2, docCharLimit: Infinity },
        { maxOwnExamples: 1, docCharLimit: 1500 },
        { maxOwnExamples: 1, docCharLimit: 800 },
        { maxOwnExamples: 0, docCharLimit: 500 },
      ]
    : [
        // Sin formato o sin propios del formato → 5 cross-format completos.
        { maxOwnExamples: 5, docCharLimit: Infinity },
        { maxOwnExamples: 4, docCharLimit: 1500 },
        { maxOwnExamples: 3, docCharLimit: 1000 },
        { maxOwnExamples: 2, docCharLimit: 600 },
      ];
  let lastPrompt = "";
  for (const p of passes) {
    lastPrompt = composeSystemPrompt({ voice, expertise, format, allFormats, expertiseDocs, isCompanyWorkspace, companyName, ...p });
    if (estimateTokens(lastPrompt) <= SYSTEM_BUDGET) return lastPrompt;
  }
  return lastPrompt;
}

// buildCompanyContext vive en ./_lib/companyContext.js — compartido con el
// generador de guiones del Content Pipeline. Ahí se arregló el serializado de
// `touchpoints` (los ángulos de venta, que antes llegaban como [object Object]).

// Sanitiza una transcripción de ejemplo eliminando menciones a marcas/personas
// del propio sistema (Inforce, Jose Huila, etc). Sin esto, la IA copiaba esos
// nombres desde los ejemplos al guion del cliente — el bug de cross-company
// que reportó Jose el 2026-05-01. Sustituye con [el creador] para mantener
// la legibilidad del ejemplo sin filtrar identidad.
const SYSTEM_NAME_PATTERNS = [
  /\bInforce\s+Consulting\b/gi,
  /\bInforce\b/gi,
  /\bInForce\s+OS\b/gi,
  /\bThe\s+Launchpad\b/gi,
  /\bHigh[\s-]?Ticket\s+Consultancy\b/gi,
  /\bPerformance\s+Agency\b/gi,
  /\bJos[eé]\s+Manuel\s+Huila\b/gi,
  /\bJose\s+Huila\b/gi,
  /\bJos[eé]\s+Manuel\b/gi,
];
function sanitizeTranscript(text) {
  if (!text || typeof text !== "string") return text;
  let out = text;
  for (const re of SYSTEM_NAME_PATTERNS) out = out.replace(re, "[el creador]");
  return out;
}

// Arma un "format" compatible con composeSystemPrompt a partir de un concepto
// del despliegue + sus variations (transcripciones de referentes propios/externos).
function conceptToFormat(concept, variations) {
  if (!concept) return null;
  const examples = (variations || []).map((v) => ({
    title: v.label || "Referente",
    transcript: sanitizeTranscript(v.transcript || ""),
    is_own: v.source_type === "produced",
  }));
  // structure = execution step-by-step del concepto.
  return {
    id: concept.id,
    name: concept.name,
    description: concept.description || "",
    structure: concept.execution || "",
    examples,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { companyId, memberId, formatId, productId, idea, reference, notes, chatHistory, estimateOnly, structure, tone } = req.body;

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  }
  if (!process.env.BACKEND_URL || !process.env.BACKEND_SERVICE_KEY) {
    return res.status(500).json({ error: "Supabase env vars not configured" });
  }

  const sb = createClient(process.env.BACKEND_URL, process.env.BACKEND_SERVICE_KEY);

  // Detectar si quien invoca es Inforce team con privilegios de bypass
  // (admin global o reviewer). Validamos contra Supabase Auth con el JWT
  // que mande el cliente — NO confiamos en flags del body.
  const bypassRateLimit = await detectTeamBypass(req, sb);

  // ── Quién puede pedir un guion ──────────────────────────────────────────
  //
  // Esta ruta no exigía NADA. Cualquiera que supiera la URL podía hacer un POST
  // y gastar tokens de Anthropic —de nuestra cuenta— sin límite y sin nombre.
  // Y el techo por empresa solo se aplicaba `if (companyId)`, así que omitir ese
  // campo salteaba también los límites. Era gasto abierto a internet.
  //
  // Ahora: si viene con empresa, hay que tener acceso a ESA empresa (dueño,
  // colaborador o equipo). Si no viene con empresa —el modo interno— hay que ser
  // del equipo. Mismo candado que ya tiene `generate-slot-script`.
  // El modo interno pide equipo ACTIVO, no admin: el Guionista de Inforce
  // Central lo usan también los editores —Jul entra ahí todos los días—, y
  // `detectTeamBypass` es más angosto que eso (solo admin o reviewer), así que
  // usarlo como candado la habría dejado afuera.
  try {
    if (companyId) await requireCompanyAccess(req, companyId);
    else await requireTeamMember(req);
  } catch (err) {
    return sendAuthError(res, err);
  }

  // Rate-limit por empresa. `estimateOnly` no gasta tokens reales, y el equipo
  // de Inforce no tiene techo — sabe lo que gasta y responde por ello.
  if (companyId && !estimateOnly && !bypassRateLimit) {
    if (await enforceCompanyTokenLimits(res, sb, companyId)) return;
  }

  try {
    // Modo WORKSPACE (empresa cliente): tablas company_* + despliegue_concepts.
    // Modo TEAM (Inforce Central, Jose): tablas legacy voice_profile, script_formats, etc.
    let systemPrompt;
    if (companyId) {
      // 1. Voice profile del workspace (niche + products).
      // 2. Concept (format) desde despliegue_concepts.
      // 3. Variations del concept desde despliegue_variations.
      // 4. Todos los conceptos del board para cross-format learning.
      // 5. Expertise documents (ya extracted_summary, NO raw_content para
      //    no inflar tokens — el resumen se hace 1 vez al subir).
      const [voiceRes, conceptRes, boardRes, docsRes, companyRes] = await Promise.all([
        sb.from("company_voice_profile").select("*").eq("company_id", companyId).maybeSingle(),
        formatId
          ? sb.from("despliegue_concepts").select("*").eq("id", formatId).maybeSingle()
          : Promise.resolve({ data: null }),
        sb.from("despliegue_boards").select("id").eq("company_id", companyId).eq("active", true).maybeSingle(),
        sb.from("company_expertise_documents")
          .select("title, category, extracted_summary")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false }),
        // Nombre real de la empresa — crítico para anclar el sujeto del guion
        // y evitar que la IA copie nombres de Inforce/Jose Huila desde
        // transcripciones de referencias del despliegue.
        sb.from("companies").select("name").eq("id", companyId).maybeSingle(),
      ]);
      const companyName = companyRes.data?.name || null;

      const boardId = boardRes.data?.id;
      let variations = [];
      let allConcepts = [];
      if (boardId) {
        const [concRes, varRes] = await Promise.all([
          sb.from("despliegue_concepts").select("*").eq("board_id", boardId).eq("archived", false),
          formatId
            ? sb.from("despliegue_variations").select("*").eq("concept_id", formatId)
            : Promise.resolve({ data: [] }),
        ]);
        allConcepts = concRes.data || [];
        variations = varRes.data || [];
      }

      const format = conceptToFormat(conceptRes.data, variations);
      const allFormats = allConcepts.map((c) => conceptToFormat(c, []));
      const companyCtx = buildCompanyContext(voiceRes.data, productId);
      const expertiseDocs = (docsRes.data || []).filter((d) => d.extracted_summary);

      // Pasamos el voice DEL WORKSPACE como `voice` al builder. El companyCtx
      // (niche + productos) va como voice.patterns. Las REGLAS de la empresa
      // (must_say/never_say/accumulated_feedback) salen de company_voice_profile —
      // antes estaban hardcodeadas a "" y se perdían, ahora se inyectan en el
      // system prompt vía composeSystemPrompt.
      const vp = voiceRes.data || {};
      const voiceLike = {
        patterns: companyCtx,
        phrases: vp.phrases || "",
        must_say: vp.must_say || "",
        never_say: vp.never_say || "",
        accumulated_feedback: vp.accumulated_feedback || "",
        market_sophistication: vp.market_sophistication ?? null,
      };
      systemPrompt = buildSystemPrompt(voiceLike, null, format, allFormats, expertiseDocs, true, companyName);
    } else {
      // TEAM mode: tablas viejas.
      const [voiceRes, expertiseRes, formatRes, allFormatsRes, expertiseDocsRes] = await Promise.all([
        sb.from("voice_profile").select("*").limit(1).single(),
        sb.from("expertise_base").select("*").limit(1).single(),
        formatId
          ? sb.from("script_formats").select("*").eq("id", formatId).single()
          : Promise.resolve({ data: null }),
        sb.from("script_formats").select("id, name, examples").order("name"),
        sb.from("expertise_documents").select("*").order("created_at", { ascending: false }),
      ]);

      systemPrompt = buildSystemPrompt(
        voiceRes.data,
        expertiseRes.data,
        formatRes.data,
        allFormatsRes.data || [],
        expertiseDocsRes.data || []
      );
    }

    // Modo estimación: solo devolver el conteo de tokens sin llamar a Claude.
    if (estimateOnly) {
      const ideaBlock = idea && idea.trim()
        ? `Quiero guionizar esta idea:\n\n**${idea.trim()}**`
        : `Generá un guion usando el concepto seleccionado aplicado al producto principal del negocio.`;
      const userMsg = [
        ideaBlock,
        reference ? `\n\n## Referencia (sólo estilo)\n${reference}` : "",
        notes ? `\n\n## Notas adicionales\n${notes}` : "",
      ].join("");
      const totalTokens = estimateTokens(systemPrompt) + estimateTokens(userMsg);
      return res.status(200).json({
        tokens: totalTokens,
        systemTokens: estimateTokens(systemPrompt),
        userTokens: estimateTokens(userMsg),
        rateLimit: 30000,
        fits: totalTokens <= 28000, // ~2K de margen
      });
    }

    // Build messages
    const messages = [];

    if (chatHistory?.length) {
      for (const msg of chatHistory) {
        messages.push({ role: msg.role, content: msg.content });
      }
    } else {
      let userMsg;
      // Modo "adaptar transcripción": cuando hay reference largo Y no hay
      // formato (el caller pasó formatId=null), el user quiere que adaptemos
      // ese guion a su voz. Lo señalamos explícito al LLM para que no pida
      // info de producto (regla "MODO ADAPTACIÓN" del system prompt).
      const refText = (reference || "").trim();
      const isAdaptMode = !formatId && refText.length > 200;

      if (isAdaptMode) {
        userMsg = `Quiero que ADAPTES la siguiente transcripción a mi voz (la del autor de los ejemplos [PROPIO]).\n\n## Transcripción a adaptar\n${refText}`;
        if (idea && idea.trim()) {
          userMsg += `\n\n## Contexto / título\n${idea.trim()}`;
        }
        if (notes) userMsg += `\n\n## Notas adicionales\n${notes}`;
        userMsg += `\n\nReescribilo línea por línea manteniendo la idea pero con MI tono, vocabulario y muletillas. Si está en otro idioma, traducilo al español. NO me pidas más información — solo adaptá.`;
      } else {
        if (idea && idea.trim()) {
          userMsg = `Quiero guionizar esta idea:\n\n**${idea.trim()}**`;
        } else {
          userMsg = `Generá un guion usando el concepto seleccionado aplicado al producto principal del negocio. Usá los ejemplos como referencia de ESTILO únicamente, y los claims SOLO de INFORMACIÓN DEL PRODUCTO.`;
        }
        if (reference) {
          userMsg += `\n\n## Referencia (transcripción de un video referente — usala SOLO para estilo, NO copies sus claims)\n${reference}`;
        }
        if (structure?.template) {
          userMsg += `\n\n## FRAMEWORK DE COPY OBLIGATORIO — ${structure.name || "estructura"}\nEste es el esqueleto del texto. El formato visual ya está cubierto por el concepto del guion. Seguí EXACTAMENTE este framework, respetando los tiempos, el orden y las reglas de "EVITÁ":\n\n${structure.template}`;
        }
        // ── Tono del guion ──
        const toneInstructions = (() => {
          if (tone === "professional") {
            return `## TONO DEL GUION — Profesional / Confianza
- Cuidado, autoridad, generador de confianza.
- "Usted" o "tú formal" según contexto. NUNCA "vos", "parce", "amigo".
- Estructura más pausada, frases completas. Sin contracciones informales (pa, pal, na).
- Sin diminutivos cariñosos. Sin slang.
- Apto para B2B, salud, finanzas, alto ticket, productos premium.`;
          }
          if (tone === "neutral") {
            return `## TONO DEL GUION — Neutral / Universal LATAM
- Español claro, accesible en toda LATAM.
- "Tú" estándar. NO "vos", NO "usted", NO slang regional ("parce", "marica", "che", "tío").
- Cercano pero no íntimo. Sin contracciones informales.
- Frases medias, claras, sin jerga local.
- Funciona para audiencia heterogénea LATAM.`;
          }
          // default: natural / colombiano
          return `## TONO DEL GUION — Natural / Colombiano descomplicado
- Cercano, descomplicado, hablado como un amigo. Sin formalidad corporativa.
- Tutéa o usa "vos" según el avatar. Default tuteo si no hay info clara.
- Gender-aware según el avatar del producto:
  · Si avatar femenino → podés usar "amiga", "linda", "chica" (con moderación, no en todas las frases).
  · Si avatar masculino → "parce", "men", "amigo", "hermano".
  · Mixto/no claro → nombres genéricos, evitá los cariñosos.
- Frases cortas, directas. Contracciones aceptadas: "pa", "pal", "na", "pa' que".
- Cero jerga corporativa. Cero "estimado cliente", "le invitamos", "no dude en contactarnos".
- IMPORTANTE: ser natural NO es ser informal sin filtro. Mantené el respeto y la claridad — solo bajá el registro.`;
        })();
        userMsg += `\n\n${toneInstructions}`;
        if (notes) userMsg += `\n\n## Notas adicionales\n${notes}`;
      }
      messages.push({ role: "user", content: userMsg });
    }

    // Stream the response
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        // 16384 (16k) — antes era 8192 y guiones largos se cortaban a mitad.
        // Sonnet 4.6 soporta hasta 64k de output; 16k es un sweet spot que cubre
        // guiones extensos sin desperdiciar costo.
        max_tokens: 16384,
        // thinking off + effort "low": Sonnet 4.6 corre en effort "high" por
        // defecto (más tokens por guión). Lo fijamos en "low" sin thinking para
        // mantener el consumo parecido a Sonnet 4 y no reventar los pools de
        // tokens por empresa. Calidad de guión equivalente o mejor que el viejo.
        thinking: { type: "disabled" },
        output_config: { effort: "low" },
        system: [
          {
            type: "text",
            text: systemPrompt,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errData = await response.json();
      console.error("Anthropic API error:", JSON.stringify(errData));
      return res.status(response.status).json(errData);
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    // Capturamos input_tokens (de message_start) y output_tokens (cumulativo
    // de message_delta) parseando los SSE events mientras los proxieamos.
    // El cliente recibe el stream completo sin alterar.
    let inputTokens = 0;
    let outputTokens = 0;
    let cacheCreationTokens = 0;
    let cacheReadTokens = 0;
    let sseBuffer = "";
    // Para auto-continue: acumulamos el texto que el modelo emitió en este
    // turn y trackeamos stop_reason. Si stop_reason es "max_tokens", hacemos
    // una segunda call con el texto acumulado como assistant turn parcial y
    // un user msg "continuá donde quedaste".
    let accumulatedText = "";
    let stopReason = null;

    const parseSseChunk = (chunk) => {
      sseBuffer += chunk;
      const events = sseBuffer.split("\n\n");
      sseBuffer = events.pop() || ""; // último puede estar incompleto
      for (const event of events) {
        const lines = event.split("\n");
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const json = line.slice(5).trim();
          if (!json) continue;
          try {
            const obj = JSON.parse(json);
            if (obj.type === "message_start" && obj.message?.usage) {
              inputTokens += obj.message.usage.input_tokens || 0;
              cacheCreationTokens += obj.message.usage.cache_creation_input_tokens || 0;
              cacheReadTokens += obj.message.usage.cache_read_input_tokens || 0;
            } else if (obj.type === "content_block_delta" && obj.delta?.type === "text_delta") {
              accumulatedText += obj.delta.text || "";
            } else if (obj.type === "message_delta") {
              if (obj.usage?.output_tokens) outputTokens += obj.usage.output_tokens;
              if (obj.delta?.stop_reason) stopReason = obj.delta.stop_reason;
            }
          } catch { /* SSE control lines o JSON parcial — ignorar */ }
        }
      }
    };

    // Stream del primer turno
    const streamFromReader = async (reader) => {
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        parseSseChunk(chunk);
        // Emitimos al cliente en TODOS los turnos, salvo los SSE de
        // message_start de turnos de continuación que confunden al parser
        // del cliente (ya recibió uno). Los content_block_delta sí pasan.
        res.write(chunk);
      }
    };

    await streamFromReader(response.body.getReader());

    // Auto-continue si el modelo cortó por max_tokens. Hasta 4 vueltas
    // extra — guiones tipo History Time Marcas con 7 beats densos pueden
    // necesitar 2-3 rounds. Antes era 2 y se quedaba corto.
    let continueRounds = 0;
    const MAX_CONTINUE_ROUNDS = 4;
    while (stopReason === "max_tokens" && continueRounds < MAX_CONTINUE_ROUNDS) {
      continueRounds++;
      stopReason = null; // se rellenará con el siguiente turno

      const continuationMessages = [
        ...messages,
        { role: "assistant", content: accumulatedText },
        // Instrucción reforzada: el modelo a veces se confunde y vuelve a
        // empezar el formato HOOKS/BODY/CTA desde 0. La frase "sin re-empezar
        // el formato" más explícita evita esa repetición.
        { role: "user", content: "Continuá EXACTAMENTE donde paraste, en la mitad de la palabra/frase si hace falta. NO repitas nada de lo ya escrito. NO vuelvas a poner los headers TÍTULO/HOOKS/BODY/CTA si ya los pusiste antes — solo sumá el texto que falta. Si estás en el body, seguí escribiendo el body. Si llegaste al CTA, terminalo." },
      ];

      const cont = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 16384,
          thinking: { type: "disabled" },
          output_config: { effort: "low" },
          system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
          messages: continuationMessages,
          stream: true,
        }),
      });
      if (!cont.ok) break; // si falla la continuación, devolvemos lo que hay
      await streamFromReader(cont.body.getReader());
    }

    // Log post-stream: solo si hay companyId. Cache reads cuestan menos pero
    // los sumamos al input para tracking conservador (igual de finitos).
    // CRÍTICO: await ANTES de res.end() para que el insert no quede colgado
    // cuando Vercel mata la function al cerrar la respuesta (sin await el log
    // se perdía silenciosamente — esto rompía el rate limiting).
    await logUsage(sb, {
      companyId, memberId,
      inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens,
      model: "claude-sonnet-4-6",
      context: { formatId: formatId || null, productId: productId || null, hasIdea: !!idea, hasReference: !!reference },
    });

    res.end();
  } catch (err) {
    console.error("generate-script error:", err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.end();
    }
  }
}
