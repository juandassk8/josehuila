// Render del guion generado al HTML que entiende el ScriptEditor del slot.
//
// El editor guarda HTML plano y lo pasa por `sanitizeScript()`, que solo deja
// pasar `p, br, b, u, ul/ol/li, h1-h3` y borra todos los atributos. Todo lo que
// emitimos acá está dentro de esa lista, así que sobrevive intacto al guardado.
//
// La estructura replica la que Jose venía tecleando a mano en cada slot:
//
//   Hook
//   • …×5
//   Body
//   • …
//   Cta
//   • …

const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

const list = (items) =>
  `<ul>${(items.length ? items : [""]).map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>`;

// Esqueleto vacío — el arranque de todo slot nuevo, para no tener que tipearlo.
export const EMPTY_SCRIPT_HTML =
  `<h3>Hook</h3>${list(["", "", "", "", ""])}<h3>Body</h3>${list([""])}<h3>Cta</h3>${list([""])}`;

// Guion generado → HTML. `hooks` puede venir filtrado (solo los elegidos en el
// panel); body es una lista de beats y cta un solo bloque.
export function slotScriptToHtml({ hooks = [], body = [], cta = null, notes = "" } = {}) {
  const hookLines = hooks.map((h) => (typeof h === "string" ? h : h?.text || "")).filter(Boolean);
  const bodyLines = body.map((b) => (typeof b === "string" ? b : b?.text || "")).filter(Boolean);
  const ctaLine = typeof cta === "string" ? cta : cta?.text || "";

  let html = `<h3>Hook</h3>${list(hookLines)}<h3>Body</h3>${list(bodyLines)}<h3>Cta</h3>${list([ctaLine].filter(Boolean))}`;
  if (notes && notes.trim()) {
    html += `<h3>Notas de grabación</h3><p>${escapeHtml(notes.trim())}</p>`;
  }
  return html;
}

// ¿El guion del slot está vacío? Cuenta como vacío tanto el default del editor
// (`<p><br></p>`) como el esqueleto sin rellenar — así el panel sabe si puede
// insertar directo o tiene que avisar que va a pisar algo.
export function isScriptEmpty(html) {
  if (!html) return true;
  const text = String(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\b(Hook|Body|Cta|Notas de grabación)\b/g, " ")
    .trim();
  return text.length === 0;
}
