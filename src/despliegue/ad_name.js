// Nomenclatura automática de creativos. Función pura que recibe el slot,
// el UGC resuelto (si tiene) y el concept (si tiene) y arma el nombre:
//
//   Creativo #007 - MOFU - Ahorro de tiempo - Camila - Testimonio
//
// El ángulo se trunca en el primer separador (coma, punto, pipe, dash)
// para que no arrastre todo el texto libre. Concept y UGC también truncan.

const STAGE_LABEL = { tofu: "TOFU", mofu: "MOFU", bofu: "BOFU" };
const FORMAT_LABEL = { video: "VIDEO", static: "ESTÁTICO" };
const ANGLE_MAX = 30;
const CONCEPT_MAX = 30;
const UGC_MAX = 25;

function truncate(s, max) {
  const clean = String(s || "").trim();
  if (!clean) return "";
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).trim() + "…";
}

// Toma la primera "idea" del texto libre: corta en el primer separador.
function firstFragment(s, max) {
  const clean = String(s || "").trim();
  if (!clean) return "";
  const sepIdx = clean.search(/[,.|·—]/);
  const head = sepIdx > 0 ? clean.slice(0, sepIdx) : clean;
  return truncate(head, max);
}

/**
 * Arma el nombre auto del creativo.
 *   Creativo #007 - VIDEO - MOFU - Ahorro de tiempo - Camila - Testimonio
 *
 * Solo se aplica a slots que ya salieron de `idea` (en scripting+). En idea
 * devolvemos vacío para que el badge no se muestre — los slots aún ideas no
 * son "creativos" definitivos.
 *
 * @param {object} slot - { creative_number, status, stage, format, angle, concept_name }
 * @param {object|null} ugc - { name } o null
 * @param {object|null} concept - { name } opcional override
 * @returns {string}
 */
export function buildAdName(slot, ugc, concept) {
  if (!slot) return "";
  // Las ideas aún no se nombran — la nomenclatura aparece solo cuando el
  // creativo entra a scripting o más adelante en el pipeline.
  if (slot.status === "idea") return "";
  if (!slot.creative_number) return "";

  const parts = [];
  parts.push(`Creativo #${String(slot.creative_number).padStart(3, "0")}`);

  if (slot.format) {
    parts.push(FORMAT_LABEL[slot.format] || String(slot.format).toUpperCase());
  }

  if (slot.stage) {
    parts.push(STAGE_LABEL[slot.stage] || String(slot.stage).toUpperCase());
  }

  const angle = firstFragment(slot.angle, ANGLE_MAX);
  if (angle) parts.push(angle);

  if (ugc?.name) parts.push(truncate(ugc.name, UGC_MAX));

  const conceptName = concept?.name || slot.concept_name;
  const c = truncate(conceptName, CONCEPT_MAX);
  if (c) parts.push(c);

  return parts.filter(Boolean).join(" - ");
}

// Devuelve el nombre a mostrar: override manual si existe, si no el auto.
// El override manual sí se muestra aunque el slot esté en idea (el admin
// puede haber escrito algo intencionalmente).
export function resolveAdName(slot, ugc, concept) {
  const manual = (slot?.ad_name || "").trim();
  if (manual) return manual;
  return buildAdName(slot, ugc, concept);
}
