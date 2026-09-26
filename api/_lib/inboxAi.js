// Vocabulario para la IA y escritura del resultado — compartido navegador/worker.
//
// ⚠️ ISOMÓRFICO. Nada de `node:*`, `Buffer` ni `import.meta`. El cliente de
// Supabase entra por parámetro: anon+RLS en el navegador, service_role en el
// worker (que no tiene sesión de nadie).

const TABLE = "reference_inbox";
const BANK_REFS_COMPANY_ID = "bank_refs";
const BANK_REFS_COMPANY_NAME = "Banco de referencias";

// Normaliza el nombre de un formato para deduplicar variantes de escritura
// (mayúsculas/acentos/espacios). El banco tiene el MISMO formato repetido por
// empresa; los colapsamos a una taxonomía limpia de tipos.
function fmtKey(s) {
  return (s || "").toString().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Conceptos del banco, solo con lo que necesita el vocabulario de formatos.
 *
 * NO es `listBankConcepts` del navegador: esa además arma agrupaciones,
 * miniaturas, nichos y slugs para pintar la vista del banco, y nada de eso
 * entra en el prompt. Reproducir esas 200 líneas acá sería copiar riesgo sin
 * ganar nada. Los campos que sí usa `buildKnownFormats` salen idénticos.
 */
async function listConceptosParaVocabulario(sb) {
  const { data: boards, error: be } = await sb
    .from("despliegue_boards").select("id, company_id").eq("active", true);
  if (be) throw be;
  if (!boards?.length) return [];

  const boardIds = boards.map((b) => b.id);
  const { data: concepts, error: ce } = await sb
    .from("despliegue_concepts")
    .select("id, board_id, stage, name, description, execution, bank_tags")
    .in("board_id", boardIds)
    .eq("archived", false)
    .eq("bank_hidden", false)
    .order("created_at", { ascending: false });
  if (ce) throw ce;
  if (!concepts?.length) return [];

  const conceptIds = concepts.map((c) => c.id);
  const [{ data: variations }, { data: companies }] = await Promise.all([
    sb.from("despliegue_variations").select("concept_id").in("concept_id", conceptIds),
    sb.from("companies").select("id, name").in("id", [...new Set(boards.map((b) => b.company_id))]),
  ]);

  const boardById = new Map(boards.map((b) => [b.id, b]));
  const companyById = new Map((companies || []).map((c) => [c.id, c]));
  const varsPorConcepto = new Map();
  for (const v of variations || []) {
    varsPorConcepto.set(v.concept_id, (varsPorConcepto.get(v.concept_id) || 0) + 1);
  }

  return concepts.map((c) => {
    const board = boardById.get(c.board_id);
    const esRefDelBanco = board?.company_id === BANK_REFS_COMPANY_ID;
    const company = board ? companyById.get(board.company_id) : null;
    return {
      id: c.id,
      name: c.name,
      stage: c.stage,
      description: c.description,
      execution: c.execution,
      bank_tags: c.bank_tags || [],
      is_bank_ref: esRefDelBanco,
      company_name: company?.name || (esRefDelBanco ? BANK_REFS_COMPANY_NAME : "—"),
      variations_count: varsPorConcepto.get(c.id) || 0,
    };
  });
}

// Formatos del banco CON SUS PATRONES (description = cuándo aplica, execution =
// cómo se hace) para que la IA matchee por PATRÓN y no solo por nombre — así deja
// de meter todo en "UGC". Deduplica por nombre normalizado quedándose con el
// representante de patrón más rico (a igualdad, el del banco neutral y con más
// referencias) y unifica bank_tags. Los patrones se recortan para no inflar el
// prompt. Se carga una vez y se pasa a cada análisis del lote.
export async function buildKnownFormats(sb) {
  const concepts = await listConceptosParaVocabulario(sb);
  const PAT_MAX = 300;
  const clip = (s) => { const t = (s || "").toString().trim().replace(/\s+/g, " "); return t.length > PAT_MAX ? t.slice(0, PAT_MAX - 1) + "…" : t; };
  const byKey = new Map();
  for (const c of concepts) {
    const key = fmtKey(c.name);
    if (!key) continue;
    const desc = (c.description || "").trim();
    const exec = (c.execution || "").trim();
    const richness = desc.length + exec.length;
    const prev = byKey.get(key);
    const tags = new Set([...(prev?.bank_tags || []), ...(Array.isArray(c.bank_tags) ? c.bank_tags : [])]);
    const better = !prev
      || richness > prev._richness
      || (richness === prev._richness && ((c.is_bank_ref ? 1 : 0) > (prev._isRef ? 1 : 0) || (c.variations_count || 0) > prev._vars));
    if (better) {
      byKey.set(key, {
        id: c.id,
        name: c.name,
        stage: c.stage,
        company_name: c.is_bank_ref ? null : c.company_name,
        description: clip(desc),
        execution: clip(exec),
        bank_tags: [...tags],
        _richness: richness,
        _isRef: !!c.is_bank_ref,
        _vars: c.variations_count || 0,
      });
    } else if (prev) {
      prev.bank_tags = [...tags];
    }
  }
  // Formatos con patrón primero (los más útiles para el match).
  return [...byKey.values()]
    .map(({ _richness, _isRef, _vars, ...f }) => f)
    .sort((a, b) => (b.description.length + b.execution.length) - (a.description.length + a.execution.length));
}

// Vocabulario de etiquetas que YA se usa en el banco, CON cuánto se usa cada una.
//
// El banco pesa TRIPLE que la bandeja: lo del banco lo aprobó una persona; lo de
// la bandeja lo propuso la IA, que es justo donde vive el desorden. Sin este peso
// una variante inventada se auto-legitima por repetirse en los pendientes.
const PESO_BANCO = 3;
const CATS = ["marca", "nicho", "subnicho", "angulo", "formato"];

export async function buildKnownLabels(sb) {
  const out = Object.fromEntries(CATS.map((c) => [c, new Map()]));
  const add = (rows, col, peso) => {
    for (const r of rows || []) {
      const l = r[col] || {};
      for (const cat of CATS) {
        for (const v of (Array.isArray(l[cat]) ? l[cat] : [])) {
          if (v) out[cat].set(v, (out[cat].get(v) || 0) + peso);
        }
      }
    }
  };
  // Vocabulario UNIDO banco + bandeja → la IA reusa términos consistentes de ambos.
  const [bank, inbox] = await Promise.all([
    sb.from("despliegue_variations").select("bank_labels").not("bank_labels", "is", null).limit(5000),
    sb.from(TABLE).select("suggested_labels").not("suggested_labels", "is", null).limit(5000),
  ]);
  add(bank.data, "bank_labels", PESO_BANCO);
  add(inbox.data, "suggested_labels", 1);

  const res = { counts: {} };
  for (const cat of CATS) {
    const orden = [...out[cat].entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    res[cat] = orden.map(([v]) => v);
    res.counts[cat] = Object.fromEntries(orden);
  }
  return res;
}

/**
 * Arma el parche del resultado de la IA. Puro: no toca la base.
 *
 * Si el ítem YA tenía un concepto asignado (Config fija / documento), NO lo
 * pisamos con lo que adivinó la IA (ni el concepto ni el nombre de formato) —
 * el usuario mandó. La IA igual llena marca/nicho/ángulo/transcript/etc.
 */
// El modelo devuelve el NOMBRE visible; las columnas guardan el slug, que es a
// donde apunta la clave foránea. Se traduce acá.
//
// Y se valida acá y no en la base a propósito: un valor inventado por el modelo
// no debe tumbar el guardado entero de la clasificación, solo perderse ese campo.
const SLUG_MOMENTO = {
  "lanzamiento": "lanzamiento",
  "promocion": "promocion", "promoción": "promocion",
  "siempre activo": "siempre-activo",
  "fecha especial": "fecha-especial",
};
const SLUG_HOOK = {
  "pregunta": "pregunta",
  "dato o estadistica": "estadistica", "dato o estadística": "estadistica", "estadistica": "estadistica", "estadística": "estadistica",
  "negacion": "negacion", "negación": "negacion",
  "demostracion": "demostracion", "demostración": "demostracion",
  "confesion": "confesion", "confesión": "confesion",
  "problema en crudo": "problema", "problema": "problema",
  "resultado primero": "resultado", "resultado": "resultado",
  "curiosidad": "curiosidad",
};
const aSlug = (mapa, v) => (typeof v === "string" ? mapa[v.trim().toLowerCase()] || null : null);

export function parcheDeResultadoIA(result, item = null) {
  const assignedConcept = item?.target_concept_id || null;
  const assignedFormat = assignedConcept ? (item?.suggested_format || null) : null;
  // Preservamos la sub-etiqueta `formato` pre-asignada (sub-concepto del documento);
  // el resto (marca/nicho/ángulo) lo llena la IA.
  const preLabels = item?.suggested_labels || {};
  const mergedLabels = { ...(result.suggested_labels || {}) };
  if (Array.isArray(preLabels.formato) && preLabels.formato.length) mergedLabels.formato = preLabels.formato;

  const patch = {
    suggested_format: assignedFormat || result.suggested_format || null,
    suggested_stage: result.suggested_stage || item?.suggested_stage || null,
    suggested_media_type: result.suggested_media_type || null,
    suggested_name: result.suggested_name || null,
    suggested_description: result.suggested_description || null,
    suggested_labels: mergedLabels,
    ai_confidence: result.ai_confidence ?? null,
    // Ejes nuevos. Van a columnas propias, no a `suggested_labels`: son valores
    // únicos de listas cerradas, no arrays de etiquetas libres.
    momento: aSlug(SLUG_MOMENTO, result.momento),
    conciencia: Number.isInteger(result.conciencia) && result.conciencia >= 1 && result.conciencia <= 5
      ? result.conciencia : null,
    hook_tipo: aSlug(SLUG_HOOK, result.hook_tipo),
    // Preservamos ai_raw previo (days_running/live/external_id de Foreplay/Apify —
    // el 🏆 del card— y demás señales) en vez de reemplazarlo.
    ai_raw: {
      ...(item?.ai_raw || {}),
      mode: result.mode,
      warnings: result.warnings || [],
      video_url: result.video_url || item?.ai_raw?.video_url || null,
      format_reason: result.format_reason ?? item?.ai_raw?.format_reason ?? null,
      format_confidence: result.format_confidence ?? null,
      needs_file: false,
      needs_file_reason: null,
    },
    source_kind: "ai",
    status: "ready",
    enriched_at: new Date().toISOString(),
    // Concepto asignado por el usuario gana; solo si no había, usamos el de la IA.
    target_concept_id: assignedConcept || result.matched_concept_id || null,
  };
  if (result.cover_url) patch.cover_url = result.cover_url;
  if (typeof result.transcript === "string") patch.transcript = result.transcript;
  // Respaldo en Drive (subido por classify-ad si la integración está configurada).
  if (result.drive_url) patch.video_backup_url = result.drive_url;
  return patch;
}
