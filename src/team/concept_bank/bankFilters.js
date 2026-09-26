import { LABEL_CATEGORIES, normLabel } from "../../despliegue/labels.js";

// Filtrar el banco por las etiquetas reales de sus referencias.
//
// Las etiquetas viven en las REFERENCIAS (`despliegue_variations.bank_labels`),
// pero la grilla muestra CONCEPTOS. Así que hay que subirlas: un concepto "tiene"
// una marca si alguna de sus referencias la tiene.
//
// Hasta ahora esto existía solo para nicho, con el mapa armado a mano en la
// página. La consulta ya traía las cinco categorías —solo se proyectaba `.nicho`—,
// así que ampliarlo era cuestión de dejar de hardcodear una sola.

export const CATS_FILTRO = LABEL_CATEGORIES.map((c) => c.key);

// concept_id → { marca: Set, nicho: Set, subnicho: Set, angulo: Set, formato: Set }
export function mapaEtiquetasPorConcepto(labelVars) {
  const m = new Map();
  for (const v of labelVars || []) {
    if (!v?.concept_id) continue;
    for (const cat of CATS_FILTRO) {
      const vals = Array.isArray(v.bank_labels?.[cat]) ? v.bank_labels[cat] : [];
      if (!vals.length) continue;
      if (!m.has(v.concept_id)) m.set(v.concept_id, {});
      const sets = m.get(v.concept_id);
      if (!sets[cat]) sets[cat] = new Set();
      for (const x of vals) if (x) sets[cat].add(x);
    }
  }
  return m;
}

// Los valores disponibles por categoría, ordenados por cuántos conceptos los usan:
// lo que más se usa, primero — es lo que uno busca.
export function opcionesPorCategoria(mapa) {
  const conteo = {};
  for (const cat of CATS_FILTRO) conteo[cat] = new Map();
  for (const sets of (mapa?.values?.() || [])) {
    for (const cat of CATS_FILTRO) {
      for (const v of (sets[cat] || [])) conteo[cat].set(v, (conteo[cat].get(v) || 0) + 1);
    }
  }
  const out = {};
  for (const cat of CATS_FILTRO) {
    out[cat] = [...conteo[cat].entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([valor, n]) => ({ valor, n }));
  }
  return out;
}

// ¿El concepto pasa los filtros de etiqueta?
//
// Y entre categorías, O dentro de una: "marca Nooro Y (subnicho Pijamas O
// Cabello)". Es como uno busca — se acota cruzando ejes, no sumando dentro del
// mismo. Se compara con `normLabel` para que "Pijamás" encuentre "pijamas".
export function conceptoPasaEtiquetas(sets, filtros, { bankTags = [] } = {}) {
  for (const cat of CATS_FILTRO) {
    const buscados = filtros?.[cat] || [];
    if (!buscados.length) continue;
    const tiene = sets?.[cat];
    const claves = new Set([...(tiene || [])].map(normLabel));
    // `bank_tags` es el etiquetado viejo, anterior a `bank_labels`. Sigue valiendo
    // para nicho: hay conceptos que solo tienen eso y desaparecerían del filtro.
    if (cat === "nicho") for (const t of bankTags) if (t) claves.add(normLabel(t));
    if (!buscados.some((b) => claves.has(normLabel(b)))) return false;
  }
  return true;
}

// El texto que el buscador tiene que mirar en un concepto, etiquetas incluidas.
// Antes buscaba en nombre, descripción y empresa pero no en `bank_labels`, así
// que escribir "pijamas" no encontraba nada aunque hubiera 47 referencias.
export function textoBuscable(item, sets) {
  const etiquetas = CATS_FILTRO.flatMap((cat) => [...(sets?.[cat] || [])]);
  return [
    item?.name, item?.description, item?.execution, item?.company_name, item?.niche,
    ...(item?.bank_tags || []), ...etiquetas,
  ].filter(Boolean).join(" ").toLowerCase();
}
