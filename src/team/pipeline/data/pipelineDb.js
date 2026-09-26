// Content Pipeline — capa de datos REAL (Supabase). Traduce filas de
// pipeline_briefs / pipeline_slots ↔ la forma que consume la UI (la misma que
// el store mock), para que los componentes no cambien.
//
// Requiere db/content_pipeline.sql corrido en Supabase.

import { database } from "../../../lib/backend.js";
import { getLabels } from "../../../despliegue/labels.js";
import { getBoardByCompany, listConcepts, listVariationsForBoard, updateVariation, updateBoardConfig, setVariationCover } from "../../../despliegue/db.js";
import { buildAdName } from "../pipelineConstants.js";
import { EMPTY_SCRIPT_HTML } from "../scriptHtml.js";
import { isUsableCover } from "../../../lib/coverUrl.js";
import { buildApiHeaders } from "../../../lib/apiAuth.js";

// ── Mapeos DB ↔ UI ───────────────────────────────────────────────────
function briefFromRow(r) {
  return {
    id: r.id, n: r.name, created: r.created_label || "", owner: r.owner || "", company_id: r.company_id,
    // Cuándo se mandó a la papelera. null = vivo. Ver db/pipeline_papelera.sql.
    deleted_at: r.deleted_at || null,
  };
}

function slotFromRow(r) {
  return {
    id: r.id, brief: r.brief_id, company_id: r.company_id, concept_id: r.concept_id || null, product_id: r.product_id || null, num: r.num, tipo: r.tipo,
    producto: r.producto || "", formato: r.formato || "", angulo: r.angulo || "",
    concepto: r.concepto || "", creador: r.creador || "", desc: r.descripcion || "",
    ref: r.ref || "", loom: r.loom || "", stage: r.stage || "idea",
    // Nivel de conciencia del embudo (tofu/mofu/bofu). Vacío en todo lo viejo:
    // es opcional, y la etiqueta se compone igual sin él.
    nivel_conciencia: r.nivel_conciencia || "",
    // Imágenes de referencia del estático (máx 3). `imagenes` llega undefined
    // mientras no se corra el SQL nuevo → [] y el bloque se ve vacío, no roto.
    imagenes: Array.isArray(r.imagenes) ? r.imagenes : [],
    script: r.script || EMPTY_SCRIPT_HTML, refs: Array.isArray(r.refs) ? r.refs : [], notas: r.notas || "",
    editor: r.editor || "", due: r.due || "", drive: r.drive || "", drive_raw: r.drive_raw || "",
    publicado: !!r.publicado, feedback: r.feedback || "", stage_done: !!r.stage_done,
    metrics: r.metrics && typeof r.metrics === "object" ? r.metrics : { gasto: "", resultados: "", cpa: "", roas: "" },
    sort_order: r.sort_order || 0,
    // Borrador de la IA + metadatos de esa generación. Se comparan contra el
    // `script` final para destilar reglas aprendidas (loop de aprendizaje).
    ai_draft: r.ai_draft || "", ai_meta: r.ai_meta && typeof r.ai_meta === "object" ? r.ai_meta : {},
    open: false, detail: false,   // UI-only, no se persisten
  };
}

// UI patch → columnas DB (desc→descripcion; open/detail no se guardan).
const COL = { desc: "descripcion" };
const SKIP = new Set(["open", "detail", "brief", "company_id", "id"]);
function slotPatchToRow(patch) {
  const row = {};
  for (const [k, v] of Object.entries(patch)) {
    if (SKIP.has(k)) continue;
    row[COL[k] || k] = v;
  }
  return row;
}

// ── Lecturas ─────────────────────────────────────────────────────────
// Trae los briefs de la empresa INCLUIDOS los que están en la papelera. Separar
// vivos de borrados es cosa de quien llama (`usePipeline`), y así se hace con una
// sola consulta en vez de dos.
//
// No filtra por `deleted_at` a propósito: si todavía no se corrió
// db/pipeline_papelera.sql la columna no existe, y un filtro sobre una columna
// que no está hace que PostgREST rechace la consulta entera. Eso tiraría el
// módulo a modo demo —que es como se ve cuando falta el SQL— por una función que
// nadie usó todavía. Sin filtro, `deleted_at` llega `undefined`, todos los
// briefs quedan vivos, y el módulo anda igual que siempre.
export async function listBriefs(companyId) {
  const { data, error } = await database.from("pipeline_briefs")
    .select("*").eq("company_id", companyId).eq("archived", false)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(briefFromRow);
}

// Cuántos contenidos tiene cada brief, sin traerlos. La papelera lo necesita
// para poder decir "Brief 3 · 17 contenidos": el nombre solo no alcanza para
// saber cuál es el que se está por recuperar, y los briefs suelen llamarse igual.
export async function countSlotsByBrief(briefIds) {
  const ids = (briefIds || []).filter(Boolean);
  if (!ids.length) return {};
  const { data, error } = await database.from("pipeline_slots").select("brief_id").in("brief_id", ids);
  if (error) throw error;
  const out = {};
  for (const r of data || []) out[r.brief_id] = (out[r.brief_id] || 0) + 1;
  return out;
}

// Los contenidos de UN brief. Hace falta al restaurar: al cargar, los slots de
// los briefs en la papelera se dejan afuera, así que volver a traerlos es la
// forma de que el brief recuperado vuelva con todo lo suyo.
export async function listSlotsOfBrief(briefId) {
  const { data, error } = await database.from("pipeline_slots")
    .select("*").eq("brief_id", briefId).order("num", { ascending: true });
  if (error) throw error;
  return (data || []).map(slotFromRow);
}

export async function listSlots(companyId) {
  const { data, error } = await database.from("pipeline_slots")
    .select("*").eq("company_id", companyId)
    .order("num", { ascending: true });
  if (error) throw error;
  return (data || []).map(slotFromRow);
}

// ── Escrituras ───────────────────────────────────────────────────────
export async function insertBrief(companyId, { name, owner, created_label }) {
  const { data, error } = await database.from("pipeline_briefs")
    .insert({ company_id: companyId, name, owner, created_label }).select().single();
  if (error) throw error;
  return briefFromRow(data);
}

export async function insertSlots(companyId, briefId, slots) {
  const rows = slots.map((s) => ({
    brief_id: briefId, company_id: companyId, num: s.num, tipo: s.tipo,
    concept_id: s.concept_id || null, concepto: s.concepto || null, stage: s.stage || "idea",
    creador: s.creador || null, formato: s.formato || null,
    nivel_conciencia: s.nivel_conciencia || null, imagenes: s.imagenes || [],
    script: s.script || EMPTY_SCRIPT_HTML, refs: s.refs || [], metrics: s.metrics || {},
  }));
  const { data, error } = await database.from("pipeline_slots").insert(rows).select();
  if (!error) return (data || []).map(slotFromRow);
  if (!faltaColumna(error)) throw error;
  // Sin db/pipeline_numeracion_conciencia_estaticos.sql corrido, Postgres
  // rechaza el INSERT ENTERO por una columna que nadie llenó todavía. Se
  // reintenta sin ellas: se pierde el nivel de conciencia hasta correr el SQL,
  // nunca el contenido.
  const { data: retry, error: retryError } = await database.from("pipeline_slots")
    .insert(rows.map(sinColumnasNuevas)).select();
  if (retryError) throw retryError;
  return (retry || []).map(slotFromRow);
}

// ¿El error es "esa columna no existe"? Postgres lo dice con 42703 y PostgREST
// con PGRST204 cuando la columna no está en su caché de esquema.
const faltaColumna = (e) => e?.code === "42703" || e?.code === "PGRST204";

const COLUMNAS_NUEVAS = ["nivel_conciencia", "imagenes"];
function sinColumnasNuevas(row) {
  const out = { ...row };
  for (const k of COLUMNAS_NUEVAS) delete out[k];
  return out;
}

/**
 * Renumera los contenidos de una tanda de briefs.
 *
 * Recibe los cambios ya calculados por `renumerar()` —qué slot pasa a qué número— y los
 * escribe. La cuenta se hace afuera, en una función pura y probada; acá solo se guarda.
 *
 * Va de a uno y no en lote a propósito. Un `upsert` masivo necesitaría mandar la fila
 * entera de cada slot, y cualquier campo que el navegador tenga desactualizado
 * —un guion que otra persona acaba de editar— se escribiría encima con la versión vieja.
 * Actualizar solo la columna `num` no puede pisar el trabajo de nadie.
 *
 * `num` no tiene índice único, así que no hay colisiones intermedias que esquivar.
 */
export async function renumerarSlots(cambios = []) {
  let hechos = 0;
  for (const c of cambios) {
    const { error } = await database.from("pipeline_slots")
      .update({ num: c.num }).eq("id", c.id);
    if (error) throw error;
    hechos += 1;
  }
  return hechos;
}

export async function updateSlotRow(id, patch) {
  const row = slotPatchToRow(patch);
  const { error } = await database.from("pipeline_slots").update(row).eq("id", id);
  if (!error) return;
  if (!faltaColumna(error)) throw error;
  // Mismo motivo que en insertSlots: una columna que falta no puede tirarse
  // abajo el guardado del resto del slot.
  const resto = sinColumnasNuevas(row);
  if (!Object.keys(resto).length) throw error;
  const { error: retryError } = await database.from("pipeline_slots").update(resto).eq("id", id);
  if (retryError) throw retryError;
}

// Guarda el guion generado junto con el borrador de la IA y sus metadatos.
//
// Si todavía no se corrió db/slot_script_ai.sql, las columnas ai_draft/ai_meta
// no existen y Postgres rechaza el UPDATE ENTERO — incluido el `script`, que es
// lo único que el usuario ve. Por eso reintentamos guardando solo el guion: se
// pierde el loop de aprendizaje hasta correr el SQL, pero nunca el guion.
export async function saveGeneratedScriptRow(id, { script, ai_draft, ai_meta }) {
  const { error } = await database.from("pipeline_slots").update({ script, ai_draft, ai_meta }).eq("id", id);
  if (!error) return { aiColumnsMissing: false };
  const { error: fallbackError } = await database.from("pipeline_slots").update({ script }).eq("id", id);
  if (fallbackError) throw fallbackError;
  return { aiColumnsMissing: true };
}

export async function deleteSlotRow(id) {
  const { error } = await database.from("pipeline_slots").delete().eq("id", id);
  if (error) throw error;
}

// Borrar varios de una. Va en UNA sola consulta y no en un `Promise.all` de
// borrados sueltos: así o se van todos o no se va ninguno, y no queda media
// selección borrada si la conexión se corta en el medio.
export async function deleteSlotRows(ids) {
  const lista = (ids || []).filter(Boolean);
  if (!lista.length) return;
  const { error } = await database.from("pipeline_slots").delete().in("id", lista);
  if (error) throw error;
}

// Mover un brief de etapa: todos sus slots que estaban en la etapa origen.
// `extra` lleva lo que el cambio de etapa arrastra consigo — hoy la fecha, cuando
// se entra a campaña. Va por parámetro y no fijo acá porque la regla de qué se
// reinicia al cambiar de etapa vive en `usePipeline`, junto a la de un solo slot.
export async function moveBriefStageRows(briefId, fromStage, toStage, extra = {}) {
  // Los slots de este brief que están parados en la etapa de origen.
  const mover = (stage) => database.from("pipeline_slots")
    .update({ stage, ...extra }).eq("brief_id", briefId).eq("stage", fromStage);

  // Mandar la tanda a To Film no manda los estáticos a grabar: no hay nada que
  // grabar en una imagen. Siguen derecho a diseño, que es su trabajo real.
  if (toStage === "film") {
    const [videos, estaticos] = await Promise.all([
      mover("film").neq("tipo", "estatico"),
      mover("edit").eq("tipo", "estatico"),
    ]);
    if (videos.error) throw videos.error;
    if (estaticos.error) throw estaticos.error;
    return;
  }

  const { error } = await mover(toStage);
  if (error) throw error;
}

// Creativos REALES de la empresa (su despliegue), agrupados por embudo, para
// "Planear creativos". Devuelve [{id, stage:'tofu'|'mofu'|'bofu', name, idea,
// refs, thumbs[]}]. Lectura pura (no crea board). [] si la empresa no tiene.
export async function listCompanyCreatives(companyId) {
  const { data: boards } = await database.from("despliegue_boards")
    .select("id").eq("company_id", companyId).eq("pipeline_type", "ads").limit(1);
  const boardId = boards?.[0]?.id;
  if (!boardId) return [];

  const { data: concepts } = await database.from("despliegue_concepts")
    .select("id, name, stage, format, description").eq("board_id", boardId).eq("archived", false)
    .order("order_index", { ascending: true });
  if (!concepts?.length) return [];

  const ids = concepts.map((c) => c.id);
  const covers = {};
  const pages = [];
  for (let i = 0; i < ids.length; i += 100) pages.push(ids.slice(i, i + 100));
  const results = await Promise.all(pages.map((p) => database.from("despliegue_variations").select("concept_id, file_url").in("concept_id", p)));
  for (const { data: vars } of results) for (const v of vars || []) { (covers[v.concept_id] ||= []).push(v.file_url); }
  return concepts
    .filter((c) => ["tofu", "mofu", "bofu"].includes(c.stage))
    .map((c) => {
      const thumbs = (covers[c.id] || []).filter(Boolean);
      // Despliegue usa 'video' | 'static'. En el pipeline el tipo es 'video' | 'estatico'.
      const tipo = c.format === "static" ? "estatico" : "video";
      return { id: c.id, stage: c.stage, name: c.name, idea: c.description || "", tipo, refs: thumbs.length, thumbs: thumbs.slice(0, 6) };
    });
}

// Referentes REALES de la empresa para el picker "Elegir del banco" del pipeline.
// Reusa EXACTAMENTE el camino del despliegue (getBoardByCompany + listConcepts +
// listVariationsForBoard) → ve los mismos referentes que el despliegue, incluidos
// los agrupados de otros boards (concept_group_id), con todas las columnas.
// Devuelve un snapshot navegable: video (drive_url), portada (file_url),
// transcripción, notas, link de Meta, etiquetas y el concepto (para agrupar/ver).
export async function listCompanyReferences(companyId) {
  const board = await getBoardByCompany(companyId, "ads");
  if (!board?.id) return { references: [], concepts: [], discarded: [], prioridades: null };
  const [concepts, variations] = await Promise.all([
    listConcepts(board.id),
    listVariationsForBoard(board.id),
  ]);
  const conceptById = {};
  for (const c of concepts || []) conceptById[c.id] = c;

  const references = [];
  for (const v of variations || []) {
    if ((v.source_type || "reference") !== "reference") continue;   // ignora producidos
    const c = conceptById[v.concept_id] || {};   // concept_id ya viene remapeado al local
    references.push({
      id: v.id, concept_id: v.concept_id, concept_name: c.name || "", stage: c.stage || "",
      format: c.format === "static" ? "static" : "video",
      name: v.name || v.label || "", brand: (getLabels(v).marca || [])[0] || "",
      // La portada se pasa tal cual si tiene alguna chance de servir. Antes acá se
      // VACIABA todo lo que no fuera Storage, y eso mataba las de Foreplay —que
      // funcionan— junto con las de Meta —que sí caducan—. Si igual falla, la
      // tarjeta tiene onError y cae al rayado; borrarla asegura que no se vea nunca.
      file_url: isUsableCover(v.file_url) ? v.file_url : "",
      drive_url: v.drive_url || "", meta_ads_library_url: v.meta_ads_library_url || "",
      meta_ad_id: v.meta_ad_id || null,
      // owned = fila propia de este board (no un hermano agrupado de otra empresa,
      // cuyo concept_id viene remapeado). Solo los propios se pueden mover acá.
      owned: String(v.origin_company_id ?? "") === String(companyId),
      transcript: v.transcript || "", notes: v.notes || "", bank_labels: v.bank_labels || {},
    });
  }
  // Conceptos del board (destinos para "Mover"), incl. los que no tienen referentes.
  const conceptList = (concepts || []).map((c) => ({ id: c.id, name: c.name || "", stage: c.stage || "", format: c.format === "static" ? "static" : "video" }));
  // Referentes descartados por este cliente (guardado en el config del board).
  const discarded = Array.isArray(board.config?.discarded_refs) ? board.config.discarded_refs : [];
  // El orden que la cuenta eligió en su Despliegue. Viaja acá porque el board ya
  // se leyó arriba: el selector ordena igual que el embudo sin una consulta más.
  return { references, concepts: conceptList, discarded, prioridades: board.config?.prioridades || null };
}

// Dado un set de ids de variación (referentes pegados a slots), devuelve
// id → portada vigente del banco. Los slots congelan una copia del referente, así
// que cuando la portada se recupera hay que curar esas copias o el slot sigue
// mostrando el rayado para siempre.
//
// Antes esto buscaba la portada de una "gemela" por `meta_ad_id` y devolvía la
// propia solo si era de Storage. Era un no-op: `meta_ad_id` está vacío en casi
// todo el banco (68 de 7651), así que nunca resolvía nada. Lo que hacía falta era
// mucho más simple — leer la portada actual de la propia fila por su id.
export async function resolveCoversForVariations(variationIds) {
  const ids = [...new Set((variationIds || []).filter(Boolean))];
  if (!ids.length) return {};
  const pages = [];
  for (let i = 0; i < ids.length; i += 100) pages.push(ids.slice(i, i + 100));
  const results = await Promise.all(
    pages.map((p) => database.from("despliegue_variations").select("id, meta_ad_id, file_url").in("id", p)),
  );
  const rows = results.flatMap(({ data }) => data || []);

  const out = {};
  for (const r of rows) if (isUsableCover(r.file_url)) out[r.id] = r.file_url;

  // Solo para las que siguen sin portada tiene sentido mirar una gemela (misma
  // creatividad de Meta importada dos veces). Es minoritario, pero sale gratis.
  const stillBroken = rows.filter((r) => !out[r.id] && r.meta_ad_id);
  if (stillBroken.length) {
    const adIds = [...new Set(stillBroken.map((r) => r.meta_ad_id))];
    const adPages = [];
    for (let i = 0; i < adIds.length; i += 100) adPages.push(adIds.slice(i, i + 100));
    const twinResults = await Promise.all(
      adPages.map((p) => database.from("despliegue_variations").select("meta_ad_id, file_url").in("meta_ad_id", p)),
    );
    const coverByAd = {};
    for (const { data } of twinResults) {
      for (const v of data || []) if (v.meta_ad_id && isUsableCover(v.file_url) && !coverByAd[v.meta_ad_id]) coverByAd[v.meta_ad_id] = v.file_url;
    }
    for (const r of stillBroken) if (coverByAd[r.meta_ad_id]) out[r.id] = coverByAd[r.meta_ad_id];
  }
  return out;
}

// Marca/desmarca un referente como "descartado" (no lo quiero recrear) para este
// cliente. Se guarda en board.config.discarded_refs (jsonb, sin SQL nuevo).
export async function toggleDiscardedRefDb(companyId, variationId, discard) {
  const board = await getBoardByCompany(companyId, "ads");
  if (!board?.id) return;
  const config = board.config || {};
  const set = new Set(Array.isArray(config.discarded_refs) ? config.discarded_refs : []);
  if (discard) set.add(variationId); else set.delete(variationId);
  await updateBoardConfig(board.id, { ...config, discarded_refs: [...set] });
}

// Guarda la portada (file_url) de un referente REAL del despliegue.
export async function setReferenceCoverDb(variationId, fileUrl) {
  // Propaga a las copias del mismo anuncio en otros boards: la portada que
  // arreglás acá tiene que verse también en el portal del cliente.
  return setVariationCover(variationId, fileUrl);
}

// ── Catálogo por empresa (productos / ángulos / creadores) ───────────────────
export async function listCatalog(companyId) {
  const { data, error } = await database.from("pipeline_catalog")
    .select("*").eq("company_id", companyId).order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function addCatalogItem(companyId, kind, value, info = null) {
  const { data, error } = await database.from("pipeline_catalog")
    .insert({ company_id: companyId, kind, value, info }).select().single();
  if (error) throw error;
  return data;
}

export async function removeCatalogItem(id) {
  const { error } = await database.from("pipeline_catalog").delete().eq("id", id);
  if (error) throw error;
}

// Loop de resultados: refleja un slot del pipeline como CREATIVO PRODUCIDO en el
// despliegue (source_type='produced') bajo su concepto, con nombre + Drive + métricas
// + feedback. Upsert por pipeline_slot_id (no duplica). Solo si el slot tiene concepto.
const stripHtml = (html) => String(html || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

export async function upsertProducedFromSlot(slot) {
  if (!slot?.concept_id || !slot?.id) return;
  const guion = stripHtml(slot.script);
  const payload = {
    concept_id: slot.concept_id,
    source_type: "produced",
    state: "produced",
    label: "Producido",
    name: buildAdName(slot),
    drive_url: slot.drive || null,
    notes: slot.feedback || null,
    transcript: guion || null,       // guion producido → base de conocimiento para Scripting
    metrics: slot.metrics || {},
    // Dimensiones denormalizadas → el scorecard de Ganadores rankea por ellas sin joins.
    dims: {
      formato: slot.tipo || null, angulo: slot.angulo || null,
      creador: slot.creador || null, producto: slot.producto || null,
    },
    pipeline_slot_id: slot.id,
    updated_at: new Date().toISOString(),
  };
  // upsert por pipeline_slot_id (requiere índice único) → sin carrera de duplicados.
  const { error } = await database.from("despliegue_variations")
    .upsert({ ...payload, produced_at: new Date().toISOString() }, { onConflict: "pipeline_slot_id" });
  if (error) throw error;
}

// Retira el creativo producido cuando el slot sale de campaign/feedback.
export async function deleteProducedForSlot(slotId) {
  if (!slotId) return;
  const { error } = await database.from("despliegue_variations").delete().eq("pipeline_slot_id", slotId);
  if (error) throw error;
}

// Reserva `count` números correlativos de la empresa y devuelve el PRIMERO del
// bloque. El número sale de un contador por empresa (`pipeline_counters`), no
// de un max()+1 sobre los slots: así el brief 5 arranca donde terminó el 4, y
// un número que ya se repartió no vuelve a repartirse aunque su creativo se
// borre. El incremento pasa entero adentro de la base → dos personas creando
// slots al mismo tiempo no pueden sacar el mismo número.
export async function reserveSlotNums(companyId, count = 1) {
  const n = Math.max(1, Number(count) || 1);
  const { data, error } = await database.rpc("next_pipeline_num", { p_company_id: companyId, p_count: n });
  const primero = Number(data);
  if (!error && Number.isFinite(primero) && primero > 0) return primero;

  // Sin el SQL corrido no hay contador. Se cae al max()+1 de la empresa —que ya
  // es correlativo global, aunque tenga la carrera de siempre— en vez de dejar
  // al módulo sin poder crear un slot.
  const { data: rows } = await database.from("pipeline_slots")
    .select("num").eq("company_id", companyId).order("num", { ascending: false }).limit(1);
  return (rows?.[0]?.num || 0) + 1;
}

// ── Links públicos del brief ─────────────────────────────────────────
// La creadora abre `/brief/<token>` sin cuenta. La tabla no la puede leer `anon`
// (RLS), así que todo pasa por `api/brief-share.js` con service_role.

async function shareApi(body) {
  const resp = await fetch("/api/brief-share", {
    method: "POST",
    headers: await buildApiHeaders(),
    body: JSON.stringify(body),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data?.error || `Error ${resp.status}`);
  return data;
}

// Crea el link para los guiones elegidos. Devuelve la URL completa, lista para
// pegar en WhatsApp.
export async function createBriefShareLink({ companyId, briefId, briefName, slotIds }) {
  const { token } = await shareApi({ action: "create", companyId, briefId, briefName, slotIds });
  return { token, url: `${window.location.origin}/brief/${token}` };
}

// Los links ya creados de la empresa: [{ token, url, brief, count, at, active }].
export async function listBriefShareLinks(companyId) {
  const { links } = await shareApi({ action: "list", companyId });
  return (links || []).map((l) => ({ ...l, url: `${window.location.origin}/brief/${l.token}` }));
}

// Cambia el nombre de un link. El token no se toca: el link sigue abriendo.
export async function renameBriefShareLink({ companyId, token, name }) {
  await shareApi({ action: "rename", companyId, token, briefName: name });
}

// Apaga o vuelve a prender un link que ya circuló.
export async function setBriefShareLinkActive({ companyId, token, active }) {
  await shareApi({ action: active ? "restore" : "revoke", companyId, token });
}

// ── Papelera ─────────────────────────────────────────────────────────
// Borrar un brief es marcarle la fecha, no sacarlo de la base. La fila y sus
// slots quedan enteros; dejan de mostrarse porque quien lee los filtra.
//
// Antes esto era un `delete` de verdad, y el `on delete cascade` de
// pipeline_slots se llevaba los guiones con él. Un click de más y no había
// vuelta atrás para nadie: se verificó contra la base que de un brief borrado no
// queda ningún rastro del que reconstruirlo.
//
// Si falla es porque falta correr db/pipeline_papelera.sql. Se propaga el error
// —y el brief NO se borra— en vez de caer al `delete` viejo: quedarse con un
// brief que se quiso borrar se arregla borrándolo otra vez; perderlo, no.
export async function deleteBriefRow(id) {
  const { error } = await database.from("pipeline_briefs")
    .update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

// Sacarlo de la papelera. Sus slots nunca se movieron, así que vuelve completo.
export async function restoreBriefRow(id) {
  const { error } = await database.from("pipeline_briefs")
    .update({ deleted_at: null }).eq("id", id);
  if (error) throw error;
}

// El borrado definitivo, el que sí se lleva los slots por el cascade. Solo se
// llega acá desde la papelera, mirando el brief que se está por perder.
export async function purgeBriefRow(id) {
  const { error } = await database.from("pipeline_briefs").delete().eq("id", id);
  if (error) throw error;
}
