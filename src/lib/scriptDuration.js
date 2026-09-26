// Estima la duración aproximada de un guión hablado (HOOKS + BODY + CTA).
//
// Calibrado con análisis empírico de videos virales del propio Inforce
// (Gemini midió 223-239 wpm en piezas que funcionaron). El "viral content
// standard" en formato corto (TikTok/Reels) está entre 180-220 wpm — más
// rápido que la conversación normal, más lento que un locutor de noticias.
//
//   - slow   (relajado / narrativo)        150-180 wpm  →  centro 165
//   - normal (viral content estándar)      180-200 wpm  →  centro 190  ★ DEFAULT
//   - fast   (alto impacto / info densa)   200-220 wpm  →  centro 210
//
// Usamos `normal` (190 wpm) como ritmo de referencia para la pill principal.

const PACES = [
  {
    key: "slow",
    label: "Relajado",
    wpm: 165,
    range: "150-180",
    hint: "narrativo, con respiraciones",
  },
  {
    key: "normal",
    label: "Normal",
    wpm: 190,
    range: "180-200",
    hint: "viral content estándar",
  },
  {
    key: "fast",
    label: "Rápido",
    wpm: 210,
    range: "200-220",
    hint: "alto impacto, info densa",
  },
];

export const PRIMARY_PACE_WPM = 190;

// Acepta tanto markdown crudo como HTML. Devuelve cantidad de palabras
// HABLADAS — descarta los labels estructurales (HOOKS, Hook 1:, BODY, CTA)
// porque son guías para el creator, no texto que se lee en el video.
export function countScriptWords(input) {
  if (!input || typeof input !== "string") return 0;

  let text = input;

  // 1. HTML: convertimos cierres de bloque a newline ANTES de strippear el
  //    resto, sino "<p>HOOKS</p><p>Hook 1:</p>" colapsa a una sola línea
  //    y los headers no se reconocen como standalone.
  text = text
    .replace(/<\/(p|h[1-6]|div|li|tr|td|th|blockquote|section|article)>/gi, "\n")
    .replace(/<(br|hr)\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

  // 2. Quitar prefijo de headings markdown (`## `, `### `, etc.).
  text = text.replace(/^#{1,6}\s+/gim, " ");

  // 3. Section labels — mayúsculas como palabra entera. Strict uppercase
  //    para no tocar "el body del email" o "cta de la marca" en el cuerpo.
  text = text.replace(/\b(HOOKS?|BODY|CTA)\b/g, " ");

  // 4. Hook N: markers (case-insensitive). Requiere número + puntuación
  //    para no strippear "el hook funciona" en el body. Acepta `:` `.` `-`
  //    o em-dash como separador.
  text = text.replace(/\bHook\s*\d+\s*[:.\-—]\s*/gi, " ");

  // 5. Markdown emphasis y enlaces básicos.
  text = text.replace(/[*_`~]/g, " ");
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

  // 6. Splitter de palabras: secuencia de letras/números/acentos.
  const tokens = text
    .split(/[^\p{L}\p{N}']+/u)
    .map((t) => t.trim())
    .filter(Boolean);

  return tokens.length;
}

// Devuelve { words, seconds, label } a ritmo NORMAL (190 wpm).
export function estimateScriptDuration(input) {
  const words = countScriptWords(input);
  if (!words) return null;
  const seconds = secondsForWords(words, PRIMARY_PACE_WPM);
  return { words, seconds, label: formatDurationLabel(seconds) };
}

// Devuelve cada ritmo con duración calculada para mostrar las 3 tarjetas.
export function estimateScriptPaces(input) {
  const words = countScriptWords(input);
  if (!words) return null;
  const paces = PACES.map((p) => {
    const seconds = secondsForWords(words, p.wpm);
    return { ...p, seconds, durationLabel: formatDurationLabel(seconds) };
  });
  return { words, paces };
}

// Versión que recibe `words` directo — para el preview cuando el user
// está moviendo el slider de densidad y aún no aplicó nada.
export function projectScriptPaces(words) {
  if (!words || words < 1) return null;
  return PACES.map((p) => {
    const seconds = secondsForWords(words, p.wpm);
    return { ...p, seconds, durationLabel: formatDurationLabel(seconds) };
  });
}

export function secondsForWords(words, wpm) {
  return Math.max(1, Math.round(words / (wpm / 60)));
}

export function formatDurationLabel(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}
