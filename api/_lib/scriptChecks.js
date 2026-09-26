// Chequeos de coherencia entre los hooks y el cuerpo del guion.
//
// El principio que todos comparten: **el cuerpo es uno, así que la promesa es una,
// y el hook es esa promesa**. Cualquiera de los 5 hooks tiene que poder ir seguido
// del mismo body sin que nada cruja. Un hook que promete otra cosa es inservible
// por bien escrito que esté — quien lo elija graba un video que no cierra.
//
// Están acá, como funciones puras y sin dependencias, por dos motivos: se pueden
// testear con el entorno `node` del repo (sin jsdom ni red), y porque ya se
// rompieron tres veces de tres formas distintas. Cada `check*` de este archivo
// nació de un guion real que salió mal.
//
// Todos devuelven `null` si está bien, o un string explicándole al modelo qué
// arreglar. Ese string entra tal cual en la ronda de corrección.

export const countWords = (s) =>
  String(s || "").split(/[^\p{L}\p{N}']+/u).filter(Boolean).length;

const textOf = (x) => String(x?.text ?? x ?? "");
const bodyText = (body) => (body || []).map(textOf).join(" ");

// ── 1. Los 5 hooks, de 5 arquetipos y con entradas distintas ────────────────

export function checkHookVariety(hooks = []) {
  const problems = [];
  if (hooks.length !== 5) problems.push(`Devolviste ${hooks.length} hooks y tienen que ser exactamente 5.`);

  const kinds = new Set(hooks.map((h) => h.archetype));
  if (hooks.length === 5 && kinds.size < 5) {
    problems.push(`Los 5 hooks tienen que ser de 5 arquetipos DISTINTOS y repetiste alguno (usaste: ${[...kinds].join(", ")}). Reescribí los repetidos con arquetipos sin usar.`);
  }

  const opener = (t) => String(t || "").toLowerCase().split(/\s+/).slice(0, 3).join(" ");
  const openers = hooks.map((h) => opener(textOf(h)));
  if (openers.length && new Set(openers).size < openers.length) {
    problems.push("Hay hooks que empiezan con las mismas 3 palabras. Cambiá la entrada de los repetidos.");
  }
  return problems.length ? problems.join("\n") : null;
}

// ── 2. La voz: si el body la narra el sujeto, los hooks también ─────────────
// Nació del referente donde el perro le hablaba a su dueño: el body era "mis
// dientes", y los hooks decían "tu perro". Heurística conservadora a propósito:
// solo marca cuando las dos señales son inequívocas.

const person = (t) => {
  const s = ` ${String(t || "").toLowerCase()} `;
  return { first: (s.match(/\bmis?\b/g) || []).length, second: (s.match(/\btus?\b/g) || []).length };
};

export function checkVoice(hooks = [], body = []) {
  const b = person(bodyText(body));
  const isFirst = b.first >= 3 && b.second === 0;
  const isSecond = b.second >= 3 && b.first === 0;
  if (!isFirst && !isSecond) return null;

  const off = hooks
    .map((h, i) => ({ n: i + 1, p: person(textOf(h)) }))
    .filter(({ p }) => (isFirst ? p.second >= 1 && p.first === 0 : p.first >= 1 && p.second === 0))
    .map(({ n }) => n);
  if (!off.length) return null;

  return `Los hooks ${off.join(", ")} rompen la voz del guion. El body está escrito ${isFirst ? "en primera persona (habla el sujeto)" : "hablándole en segunda persona al espectador"} y esos hooks usan la voz contraria, así que no enganchan con el cuerpo. Reescribilos DENTRO de la misma premisa, cambiando la puerta de entrada pero no quién habla.`;
}

// ── 3. El marco: si el body arranca en secuencia, el hook lo planta ─────────
// Nació del referente "esto es lo que pasaría en 3 semanas": el body decía
// "Después del primer día…" y cuatro hooks nunca mencionaban el plazo.

const SEQUENCE_OPEN = /^\s*(despu[eé]s\s+d|al\s+(primer|segundo|tercer)|a\s+los\s+\d|en\s+la\s+(primera|segunda|tercera)|el\s+(primer|d[ií]a)|tras\s+|para\s+el\s+d[ií]a)/i;
const FRAME_SET = /\bsi\b|esto es lo que|qu[eé] pasar[ií]a|qu[eé] pasa si|en \d+\s*(d[ií]as|semanas|meses)|durante\s+\d|dale\s+\d|semana\s*1/i;

export function checkTimeFrame(hooks = [], body = []) {
  const first = textOf((body || [])[0]);
  if (!SEQUENCE_OPEN.test(first)) return null;
  const dangling = hooks.map((h, i) => ({ n: i + 1, ok: FRAME_SET.test(textOf(h)) })).filter((x) => !x.ok).map((x) => x.n);
  if (!dangling.length) return null;
  return `El body arranca con "${first.split(/\s+/).slice(0, 6).join(" ")}…", que da por sentado un marco temporal, pero los hooks ${dangling.join(", ")} nunca lo plantan: quien elija esos hooks va a ver un video que empieza por la mitad. Reescribilos dejando parado el mismo marco que el hook 1, cambiando solo la puerta de entrada.`;
}

// ── 4. La lista: mismo número y misma cosa enumerada ────────────────────────
// Nació del referente "4 razones por las que Grüns es el mejor aliado del GLP1".
// El body enumeraba 4 beneficios del producto, y un hook prometía "cuatro razones
// para evitar el veterinario": mantuvo el número y cambió DE QUÉ es la lista.

const ORDINALS = /^\s*(primero|segundo|tercero|cuarto|quinto|y\s+por\s+[úu]ltimo|por\s+[úu]ltimo|\d\s*[.)-])/i;
const NUM_WORD = {
  dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7,
};
const ANNOUNCE = /\b(\d+|dos|tres|cuatro|cinco|seis|siete)\s+(razones|motivos|formas|maneras|cosas|claves|pasos|beneficios)\b/i;

// Cuántos beats del cuerpo están enumerados con ordinales.
export function countListBeats(body = []) {
  return (body || []).filter((b) => ORDINALS.test(textOf(b))).length;
}

const announcedCount = (text) => {
  const m = String(text || "").match(ANNOUNCE);
  if (!m) return null;
  const raw = m[1].toLowerCase();
  return NUM_WORD[raw] ?? (parseInt(raw, 10) || null);
};

// `subjects` = términos que identifican de qué es la lista (producto, ángulo).
export function checkList(hooks = [], body = [], subjects = []) {
  const n = countListBeats(body);
  if (n < 2) return null;   // el cuerpo no es una lista enumerada

  const terms = subjects
    .flatMap((s) => String(s || "").split(/\s+/))
    .map((w) => w.toLowerCase())
    .filter((w) => w.length > 3);

  const problems = [];
  const wrongCount = [];
  const wrongSubject = [];

  hooks.forEach((h, i) => {
    const t = textOf(h);
    const announced = announcedCount(t);
    if (announced == null) return;                  // ese hook no anuncia lista
    if (announced !== n) wrongCount.push(`${i + 1} (dice ${announced})`);
    // ¿Nombra aquello de lo que trata la lista?
    const lower = t.toLowerCase();
    if (terms.length && !terms.some((w) => lower.includes(w))) wrongSubject.push(i + 1);
  });

  if (wrongCount.length) {
    problems.push(`El cuerpo enumera ${n} puntos, pero los hooks ${wrongCount.join(", ")} anuncian otra cantidad. El número del hook y el del cuerpo tienen que ser el mismo.`);
  }
  if (wrongSubject.length) {
    problems.push(`Los hooks ${wrongSubject.join(", ")} anuncian una lista de otra cosa. El cuerpo enumera ${n} puntos sobre ${subjects.filter(Boolean).join(" / ")}, así que el hook tiene que prometer ESA lista. Prometer "N razones para evitar X" y después enumerar los beneficios del producto deja al espectador con la pregunta sin responder.`);
  }
  return problems.length ? problems.join("\n") : null;
}

// ── 5. Presupuesto de palabras ─────────────────────────────────────────────

export function measureWords({ hooks = [], body = [], cta = null }) {
  const hookAvg = hooks.length ? Math.round(hooks.reduce((s, h) => s + countWords(textOf(h)), 0) / hooks.length) : 0;
  const bodyWords = (body || []).reduce((s, b) => s + countWords(textOf(b)), 0);
  const ctaWords = countWords(textOf(cta));
  return { hookAvg, body: bodyWords, cta: ctaWords, total: hookAvg + bodyWords + ctaWords };
}

export function checkWordBudget(out, targetWords, tolerance = 0.15) {
  const { total } = measureWords(out);
  const drift = Math.abs(total - targetWords) / (targetWords || 1);
  if (drift <= tolerance) return null;
  return total > targetWords
    ? `El guion quedó en ~${total} palabras y el objetivo es ~${targetWords}. Recortá ${total - targetWords} palabras del body sacando relleno, sin perder ningún beat.`
    : `El guion quedó en ~${total} palabras y el objetivo es ~${targetWords}. Sumá ${targetWords - total} palabras dándole más concreción a los beats, sin agregar beats nuevos ni claims nuevos.`;
}

// ── Todo junto ─────────────────────────────────────────────────────────────

// `subjects` son los términos de los que trata el guion (producto y ángulo), para
// poder detectar cuándo un hook promete una lista de otra cosa.
export function checkScript(out, targetWords, { subjects = [] } = {}) {
  const hooks = out.hooks || [];
  const body = out.body || [];
  const found = [
    checkHookVariety(hooks),
    checkVoice(hooks, body),
    checkTimeFrame(hooks, body),
    checkList(hooks, body, subjects),
    checkWordBudget(out, targetWords),
  ].filter(Boolean);
  return found.length ? found.join("\n") : null;
}
