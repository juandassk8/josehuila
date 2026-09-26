// Parte el HTML de un guion en sus bloques: ganchos, cuerpo y cierre.
//
// El guion se guarda como HTML plano (ver `scriptHtml.js`): un `<h3>` por bloque
// y una lista debajo. La página pública necesita los ganchos SUELTOS —se muestran
// como opciones A/B/C, que es lo único que la creadora elige— así que hay que
// leer esa estructura en vez de volcar el HTML entero.
//
// Es tolerante a mano ajena: José edita los guiones a mano, así que los títulos
// se reconocen por su texto (hook/gancho, body/cuerpo, cta/cierre) y cualquier
// bloque que no encaje se conserva tal cual bajo su propio título. Si el guion no
// tiene títulos —pegado de otro lado— se devuelve `raw` y la página lo muestra
// completo, sin inventar una estructura que no está.
//
// Sin DOM: se usa desde el browser pero se testea en node, y una regex acotada a
// nuestro propio HTML alcanza. El saneado del contenido sigue siendo de
// `sanitizeScript` en el render.

const stripTags = (s) => String(s || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ");

const normalize = (s) =>
  stripTags(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

// ¿Este trozo de HTML tiene algo que leer, o es solo un <br> de relleno?
export function hasContent(html) {
  return stripTags(html).replace(/&[a-z]+;/gi, " ").trim().length > 0;
}

function roleOf(title) {
  const t = normalize(title);
  if (/\bhook|gancho/.test(t)) return "hooks";
  if (/\bbody|cuerpo|desarrollo/.test(t)) return "body";
  if (/\bcta|cierre|llamado|call to action/.test(t)) return "cta";
  return null;
}

// ¿Este bloque es un TÍTULO de sección?
//
// Un `<h3>` siempre lo es. Un `<p>` o un `<div>` solo si su texto ES la etiqueta
// y nada más ("Hook", "Body", "CTA:"): así se leen los guiones que José tipeó a
// mano antes del generador, donde el editor escribía `<p>Hook</p>` en vez de un
// heading. Un párrafo del cuerpo que mencione "el hook" no cae acá porque tiene
// más texto alrededor.
const ROLE_ONLY = /^(hooks?|ganchos?|body|cuerpo|desarrollo|cta|cierre|llamado a la accion|call to action|notas?( de grabacion)?)\s*:?$/;

function headingRole(tag, inner) {
  const t = normalize(inner);
  if (!t) return null;
  if (/^h[1-3]$/i.test(tag)) return { role: roleOf(inner), title: stripTags(inner).trim() };
  if (t.length <= 40 && ROLE_ONLY.test(t)) return { role: roleOf(inner), title: stripTags(inner).trim() };
  return null;
}

// Trozo de HTML → lista de ítems, EN ORDEN. Toma los `<li>` y también los
// párrafos sueltos que quedan fuera de la lista (acotaciones tipo "(clip final
// mostrando el producto)" que si no se perderían). Descarta los envoltorios y
// los `<div><br></div>` de relleno.
function itemsOf(chunk) {
  const out = [];
  for (const m of chunk.matchAll(/<(li|p|div|h[4-6])[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const inner = m[2];
    if (/<(ul|ol|li)\b/i.test(inner)) continue;   // envoltorio, no ítem
    if (hasContent(inner)) out.push(inner.trim());
  }
  if (out.length) return out;
  return hasContent(chunk) ? [chunk.trim()] : [];
}

// html → { lead[], hooks[], body[], cta[], extra[{title, items[]}], raw }
// `raw` solo viene cuando el guion no tiene títulos y no hay estructura que leer.
// `lead` es lo que venga ANTES del primer título: se conserva para no perder
// nada de lo que alguien haya escrito arriba.
export function splitScriptSections(html) {
  const src = String(html || "");
  const empty = { lead: [], hooks: [], body: [], cta: [], extra: [], raw: null };
  if (!hasContent(src)) return empty;

  const heads = [];
  for (const m of src.matchAll(/<(h[1-3]|p|div)[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const head = headingRole(m[1], m[2]);
    if (head) heads.push({ index: m.index, length: m[0].length, ...head });
  }
  if (!heads.length) return { ...empty, raw: src };

  const out = { ...empty, lead: itemsOf(src.slice(0, heads[0].index)) };
  heads.forEach((h, i) => {
    const from = h.index + h.length;
    const to = i + 1 < heads.length ? heads[i + 1].index : src.length;
    const items = itemsOf(src.slice(from, to));
    if (!items.length) return;
    if (h.role) out[h.role].push(...items);
    else out.extra.push({ title: h.title, items });
  });
  return out;
}

// Texto plano de un ítem — para el `title` de un botón o para copiar al portapapeles.
export function itemText(html) {
  return stripTags(html).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
}
