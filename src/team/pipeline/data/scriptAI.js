// Orquestador cliente del generador de guiones del slot.
//
// Encadena tres cosas, saltándose las que ya están hechas:
//
//   1. Transcripción — si un referente pegado no tiene guion, se baja su
//      respaldo de video y se transcribe (/api/classify-ad modo transcript_only,
//      que ya existía para el backfill del banco). El resultado se escribe de
//      vuelta en el banco Y en el snapshot del slot, así se paga UNA sola vez.
//   2. Blueprint — el esqueleto estructural del referente, cacheado en
//      `despliegue_variations.script_blueprint`. También se paga una sola vez,
//      y lo aprovechan todos los slots que peguen ese mismo referente.
//   3. Generación — el guion.
//
// Cada paso reporta por `onProgress` para que el panel muestre en qué anda.

import { database } from "../../../lib/backend.js";
import { buildApiHeaders } from "../../../lib/apiAuth.js";
import { transcribeVariation } from "../../../despliegue/transcribeRef.js";
import { countScriptWords } from "../../../lib/scriptDuration.js";

// Sin referente no hay ancla de extensión (≈47s a 190 wpm).
export const DEFAULT_TARGET_WORDS = 150;

// Espejo de BLUEPRINT_VERSION en api/generate-slot-script.js (el browser no puede
// importar del bundle de la API). Los blueprints cacheados con una versión vieja
// se recalculan: la v1 guardaba solo la función abstracta de cada beat (guion
// genérico), y la v2 no capturaba la PREMISA del video (hooks que no enganchaban
// con el body).
// ⚠️ Si subís la versión allá, subila acá.
const BLUEPRINT_VERSION = 5;

const refId = (r) => (typeof r === "string" ? r : r?.id);
const hasText = (s) => !!String(s || "").trim();

// ¿Este blueprint cacheado se puede usar? Sin beats no hay cuerpo que escribir,
// así que vale más pagar de nuevo la llamada que entregar un guion vacío.
export const blueprintUsable = (bp) => Array.isArray(bp?.beats) && bp.beats.length > 0;

async function postJson(url, body) {
  const resp = await fetch(url, {
    method: "POST",
    headers: await buildApiHeaders(),
    body: JSON.stringify(body),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(data?.message || data?.error || `Error ${resp.status}`);
    err.status = resp.status;
    err.payload = data;
    throw err;
  }
  return data;
}

// Trae del banco lo que el snapshot congelado del slot puede no tener al día:
// la transcripción (si se transcribió después de pegarlo) y el blueprint.
async function loadFreshRefs(ids) {
  if (!ids.length) return {};
  const { data, error } = await database
    .from("despliegue_variations")
    .select("id, transcript, drive_url, bank_labels, script_blueprint")
    .in("id", ids);
  if (error) {
    console.warn("[scriptAI] loadFreshRefs failed:", error.message);
    return {};
  }
  return Object.fromEntries((data || []).map((r) => [r.id, r]));
}

// Prepara UN referente: se asegura de que tenga transcripción y blueprint.
// Devuelve { blueprint, transcript, skipped } — `skipped` explica por qué no se
// pudo usar, para que el panel lo diga en vez de fallar en silencio.
async function prepareRef(ref, fresh, { companyId, memberId, onProgress, index, total }) {
  const id = refId(ref);
  const row = fresh[id] || {};
  const label = (typeof ref === "object" && ref?.name) || `referente ${index + 1}`;

  let transcript = row.transcript || (typeof ref === "object" ? ref.transcript : "") || "";

  // Blueprint ya cacheado y de la versión actual → no se recalcula nada. Igual
  // devolvemos la transcripción: el panel la muestra al lado del guion para poder
  // comparar la estructura.
  // La versión correcta no alcanza: el blueprint tiene que SERVIR. Uno con
  // `beats` vacío o con el tipo equivocado pasa la comprobación de versión y
  // después genera un guion sin estructura de cuerpo —o tira
  // "(bp.beats || []).map is not a function", que es lo que se vio en producción.
  // Si no sirve, se ignora el caché y se rehace desde la transcripción.
  if (row.script_blueprint?.version === BLUEPRINT_VERSION && blueprintUsable(row.script_blueprint)) {
    return { blueprint: row.script_blueprint, transcript, label };
  }

  if (!hasText(transcript)) {
    if ((row.bank_labels || {})._audio === "none") {
      return { skipped: `“${label}” no tiene audio.` };
    }
    onProgress?.(`Transcribiendo ${label}${total > 1 ? ` (${index + 1}/${total})` : ""}…`);
    // Mismo camino que el botón "Transcribir guion" del visor: se guarda en el
    // banco, así que da igual quién lo dispare primero — se paga una sola vez.
    const t = await transcribeVariation(row.drive_url ? { ...row, id } : { ...ref, id });
    if (!t.ok) return { skipped: `“${label}”: ${t.reason}` };
    transcript = t.transcript;
  }

  onProgress?.(`Analizando estructura de ${label}${total > 1 ? ` (${index + 1}/${total})` : ""}…`);
  const b = await postJson("/api/generate-slot-script", {
    mode: "blueprint", companyId, memberId, variationId: id, transcript,
  });
  return { blueprint: b.blueprint, transcript, label };
}

// Genera el guion completo de un slot.
//
// `slot` es la fila del pipeline tal cual. `onProgress(msg)` recibe el paso
// actual. Devuelve { hooks, body, cta, notes_for_creator, words, targetWords,
// warning, skipped[] }.
export async function generateSlotScript(slot, { companyId, memberId, onProgress, hooksOnly = false, existing = null, angulo = null, anchorRefId = null, instruction = "", current = null } = {}) {
  // Un referente = un molde. Si se pidió desde la tarjeta de un referente concreto,
  // ese es el único que define la forma: mezclar tres vuelve difusa la fidelidad,
  // que es justo lo que había que arreglar.
  const all = Array.isArray(slot.refs) ? slot.refs : [];
  const refs = anchorRefId ? all.filter((r) => refId(r) === anchorRefId) : all;
  const ids = refs.map(refId).filter(Boolean);
  const fresh = await loadFreshRefs(ids);

  const blueprints = [];
  const references = [];   // transcripciones usadas — el panel las muestra al lado
  const skipped = [];
  let anchorWords = 0;

  for (let i = 0; i < refs.length; i++) {
    try {
      const r = await prepareRef(refs[i], fresh, { companyId, memberId, onProgress, index: i, total: refs.length });
      if (r.blueprint) {
        blueprints.push(r.blueprint);
        if (r.transcript) references.push({ label: r.label, transcript: r.transcript });
        // La extensión la marca el PRIMER referente utilizable.
        if (!anchorWords) {
          anchorWords = r.blueprint.total_words || countScriptWords(r.transcript || fresh[refId(refs[i])]?.transcript || "");
        }
      } else if (r.skipped) {
        skipped.push(r.skipped);
      }
    } catch (e) {
      skipped.push(`Falló el análisis de un referente: ${e.message}`);
    }
  }

  const targetWords = anchorWords || DEFAULT_TARGET_WORDS;

  onProgress?.(hooksOnly ? "Escribiendo hooks nuevos…" : "Escribiendo el guion…");
  const out = await postJson("/api/generate-slot-script", {
    mode: "generate",
    companyId, memberId,
    slot: {
      producto: slot.producto || "",
      product_id: slot.product_id || null,
      // El ángulo elegido en el panel gana sobre el del slot: sin ángulo el
      // guion no tiene columna vertebral y termina calcando al referente.
      angulo: angulo || slot.angulo || "",
      concepto: slot.concepto || "",
      concept_id: slot.concept_id || null,
      creador: slot.creador || "",
      desc: slot.desc || "",
    },
    blueprints,
    targetWords,
    hooksOnly,
    existing,
    instruction,
    current,
  });

  return { ...out, skipped, references };
}

// Loop de aprendizaje: compara el borrador que escribió la IA contra la versión
// final que dejó el usuario, y destila reglas que se acumulan en
// `company_voice_profile.accumulated_feedback` — que ya se inyecta en el prompt.
// O sea: cada corrección que hacés a mano mejora la generación siguiente.
//
// Se apoya en /api/extract-voice-patterns, que ya existía para el Guionista y
// se saltea solo si la diferencia entre borrador y final es menor al 20%.
// Fire-and-forget: si falla, no pasa nada visible.
export async function learnFromSlotEdits(slot, { companyId }) {
  if (!companyId) return false;
  if (!hasText(slot?.ai_draft) || !hasText(slot?.script)) return false;
  if (slot.ai_draft === slot.script) return false;
  try {
    const r = await postJson("/api/extract-voice-patterns", {
      companyId,
      aiDraft: slot.ai_draft,
      userFinal: slot.script,
      scriptTitle: slot.desc || "",
      productName: slot.producto || "",
      formatName: slot.concepto || "",
    });
    return !!r?.ok;
  } catch (e) {
    console.warn("[scriptAI] learnFromSlotEdits failed:", e.message);
    return false;
  }
}
