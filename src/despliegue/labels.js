import { DS } from "../lib/design.js";

// Etiquetas multi-dimensionales para referencias (despliegue_variations.bank_labels).
// Compartido entre el Banco de creativos (team/concept_bank) y el despliegue
// (equipo + clientes). Categorías fijas pero extensibles: agregar una entrada acá
// la habilita en toda la UI (chips, editor, filtro, agrupar) sin migración.
export const LABEL_CATEGORIES = [
  { key: "marca",    label: "Marca",     color: DS.purple },
  { key: "nicho",    label: "Nicho",     color: DS.blue },
  { key: "subnicho", label: "Sub-nicho", color: "#22B8C6" },
  { key: "angulo",   label: "Ángulo",    color: DS.amber },
  { key: "formato",  label: "Formato",   color: DS.green },
];

export const CATEGORY_BY_KEY = Object.fromEntries(LABEL_CATEGORIES.map((c) => [c.key, c]));

// Normaliza el jsonb de una variation a { marca:[], nicho:[], angulo:[], formato:[] }.
// Tolera null / formas viejas.
export function getLabels(v) {
  const raw = (v && v.bank_labels) || {};
  const out = {};
  for (const cat of LABEL_CATEGORIES) {
    const val = raw[cat.key];
    out[cat.key] = Array.isArray(val) ? val.filter(Boolean) : [];
  }
  return out;
}

// ¿La variation tiene al menos una etiqueta en cualquier categoría?
export function hasAnyLabel(v) {
  const l = getLabels(v);
  return LABEL_CATEGORIES.some((c) => l[c.key].length > 0);
}

// Aplana a lista de { category, value, color } para pintar chips en orden de categoría.
export function labelChipList(v) {
  const l = getLabels(v);
  const chips = [];
  for (const cat of LABEL_CATEGORIES) {
    for (const value of l[cat.key]) chips.push({ category: cat.key, value, color: cat.color });
  }
  return chips;
}

// Valores únicos presentes en una lista de variations para una categoría
// (para chips de filtro + autocomplete). Ordenados alfabéticamente.
// Deduplica IGNORANDO mayúsculas y acentos: "Calzado" y "calzado" son la misma
// etiqueta y aparecían como dos opciones distintas —en el filtro y, sobre todo,
// en la pantalla de prioridades, donde tenés que elegir entre las dos sin saber
// cuál es—. Se conserva el casing de la primera que aparece, que es lo que ya
// hace `mergeLabelValue` cuando se escriben etiquetas.
export function distinctValues(variations, catKey) {
  let out = [];
  for (const v of variations || []) {
    for (const val of getLabels(v)[catKey] || []) out = mergeLabelValue(out, val);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

// Sugerencias por categoría (para el autocomplete del editor).
export function suggestionsByCategory(variations) {
  const out = {};
  for (const cat of LABEL_CATEGORIES) out[cat.key] = distinctValues(variations, cat.key);
  return out;
}

// Clave normalizada de etiqueta: minúsculas, sin acentos, sin espacios de más.
// Así "Calzado"/"calzado"/"CALZADO"/"Calzado " se consideran la MISMA etiqueta.
export function normLabel(s) {
  return (s || "").toString().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

// Agrega `value` a `arr` salvo que ya exista un valor normLabel-igual (mismo texto
// ignorando mayúsculas/acentos/espacios). REUSA el valor existente (conserva su
// casing original — no lo minúsculiza) → evita crear chips duplicados como
// "Ryze"/"ryze" o "Ángulo"/"angulo". Devuelve SIEMPRE un array nuevo; no muta el
// original. Un `value` vacío (o que normaliza a "") no se agrega.
export function mergeLabelValue(arr, value) {
  const base = Array.isArray(arr) ? [...arr] : [];
  const key = normLabel(value);
  if (!key) return base;
  if (base.some((v) => normLabel(v) === key)) return base;
  base.push(value);
  return base;
}

// filters = { marca: Set|Array, nicho: ..., ... }. Match = AND entre categorías con
// selección, OR dentro de cada categoría. Categorías sin selección no filtran.
// El match es INSENSIBLE a mayúsculas/acentos → el filtro no pierde variantes.
export function variationMatches(v, filters) {
  const l = getLabels(v);
  for (const cat of LABEL_CATEGORIES) {
    const sel = filters?.[cat.key];
    const selArr = sel instanceof Set ? [...sel] : (sel || []);
    if (selArr.length === 0) continue;
    const selNorm = new Set(selArr.map(normLabel));
    const has = l[cat.key].some((val) => selNorm.has(normLabel(val)));
    if (!has) return false;
  }
  return true;
}

export function hasActiveFilters(filters) {
  return LABEL_CATEGORIES.some((c) => {
    const sel = filters?.[c.key];
    const n = sel instanceof Set ? sel.size : (sel?.length || 0);
    return n > 0;
  });
}

// ───────── Filtro por presencia de links (Meta / Drive) ─────────
// Un creativo (variation) puede tener link de Meta Ads Library y/o Drive.
// Estas opciones cubren los casos que el equipo usa para curar el banco:
// "tengo Meta pero no Drive", "tengo ambos", "no tiene ningún link", etc.
export const LINK_FILTERS = [
  { key: "all",            label: "Todos" },
  { key: "meta",           label: "Con Meta" },
  { key: "drive",          label: "Con Drive" },
  { key: "meta_no_drive",  label: "Meta sin Drive" },
  { key: "meta_and_drive", label: "Meta + Drive" },
  { key: "no_link",        label: "Sin link" },
];

const hasLink = (s) => !!(s && String(s).trim());

export function linkMatches(v, linkFilter) {
  if (!linkFilter || linkFilter === "all") return true;
  const meta = hasLink(v?.meta_ads_library_url);
  const drive = hasLink(v?.drive_url);
  switch (linkFilter) {
    case "meta": return meta;
    case "drive": return drive;
    case "meta_no_drive": return meta && !drive;
    case "meta_and_drive": return meta && drive;
    case "no_link": return !meta && !drive;
    default: return true;
  }
}

// ¿Hay algún filtro de canvas activo (etiquetas o links)?
export function anyCanvasFilterActive(filters, linkFilter) {
  return hasActiveFilters(filters) || (!!linkFilter && linkFilter !== "all");
}

// Predicado combinado: pasa si matchea etiquetas Y el filtro de links.
export function variationVisible(v, filters, linkFilter) {
  return variationMatches(v, filters) && linkMatches(v, linkFilter);
}

export const NO_LABEL = "__sin__";

// Agrupa variations por el PRIMER valor de la categoría groupByKey. Ordena los
// grupos por CANTIDAD de referencias (desc) — la marca con más refs primero —,
// con desempate alfabético. El grupo "(sin etiqueta)" siempre va al final.
export function groupVariations(variations, groupByKey) {
  const map = new Map();
  for (const v of variations || []) {
    const vals = getLabels(v)[groupByKey] || [];
    const key = vals[0] || NO_LABEL;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(v);
  }
  const keys = [...map.keys()]
    .filter((k) => k !== NO_LABEL)
    .sort((a, b) => (map.get(b).length - map.get(a).length) || a.localeCompare(b));
  const groups = keys.map((k) => ({ value: k, label: k, items: map.get(k) }));
  if (map.has(NO_LABEL)) groups.push({ value: NO_LABEL, label: "Sin etiqueta", items: map.get(NO_LABEL) });
  return groups;
}

// ───────── Prioridades por cuenta ─────────
//
// Cada empresa dice en qué orden le interesan las referencias. Se guarda en
// `despliegue_boards.config.prioridades`:
//
//   { nicho: ["Salud", "Belleza"], angulo: ["Bajar de peso"], soloPrioridades: false }
//
// Sin nada configurado esto no hace absolutamente nada: el orden queda como
// estaba. Es la garantía que necesitan las cuentas que no lo van a usar.

// Categorías que se pueden priorizar, EN ORDEN DE MANDO. El nicho pesa más que
// el ángulo, y por eso está primero: agregar `subnicho` o `marca` acá alcanza
// para habilitarlas —el resto del código no las nombra.
export const CATEGORIAS_PRIORIZABLES = ["nicho", "angulo"];

export function hayPrioridades(prioridades) {
  return CATEGORIAS_PRIORIZABLES.some((c) => (prioridades?.[c] || []).length > 0);
}

// Posición de una variation dentro de una categoría priorizada.
// Devuelve el índice (0 = lo más prioritario) o Infinity si no está en la lista.
//
// Una referencia puede tener varias etiquetas de la misma categoría —"Salud" y
// "Belleza"—; vale la MEJOR. Si te interesa la salud, una referencia que además
// es de salud te interesa, aunque también sea de otra cosa.
function posicionEn(v, categoria, lista) {
  const orden = (lista || []).map(normLabel);
  if (!orden.length) return Infinity;
  let mejor = Infinity;
  for (const val of getLabels(v)[categoria] || []) {
    const i = orden.indexOf(normLabel(val));
    if (i !== -1 && i < mejor) mejor = i;
  }
  return mejor;
}

// El puntaje es un vector, una posición por categoría, y se compara en orden.
//
// JERÁRQUICO y no una suma: primero manda el nicho, y recién adentro del mismo
// nicho ordena el ángulo. Con un puntaje sumado, una referencia de Calzado con
// el ángulo top se colaría arriba de una de Salud y nadie entendería por qué.
export function puntajeDePrioridad(v, prioridades) {
  return CATEGORIAS_PRIORIZABLES.map((c) => posicionEn(v, c, prioridades?.[c]));
}

// ¿Esta referencia entra en alguna prioridad? Lo usa el modo "solo prioridades".
export function esPrioritaria(v, prioridades) {
  return puntajeDePrioridad(v, prioridades).some((n) => n !== Infinity);
}

// Ordena sin mutar. Lo no priorizado queda al final CONSERVANDO su orden
// original: es un reordenamiento estable, no una lista nueva.
export function ordenarPorPrioridad(variations, prioridades) {
  const lista = variations || [];
  if (!hayPrioridades(prioridades)) return lista;
  const base = prioridades?.soloPrioridades
    ? lista.filter((v) => esPrioritaria(v, prioridades))
    : lista;
  return base
    .map((v, i) => ({ v, i, p: puntajeDePrioridad(v, prioridades) }))
    .sort((a, b) => {
      for (let k = 0; k < a.p.length; k++) {
        if (a.p[k] !== b.p[k]) return a.p[k] - b.p[k];
      }
      return a.i - b.i;   // empate: como venían
    })
    .map((x) => x.v);
}

// Cuántas de estas referencias son prioritarias. Sirve para ordenar los
// CONTENEDORES —las tarjetas de concepto— por cuánto de lo que te interesa
// tienen adentro, sin que una tarjeta con una sola referencia buena le gane a
// otra con diez.
export function cuantasPrioritarias(variations, prioridades) {
  if (!hayPrioridades(prioridades)) return 0;
  return (variations || []).filter((v) => esPrioritaria(v, prioridades)).length;
}
