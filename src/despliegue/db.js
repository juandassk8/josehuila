import { database } from "../lib/backend.js";
import { buildApiHeaders } from "../lib/apiAuth.js";
import { normLabel, mergeLabelValue } from "./labels.js";
import { isUsableCover } from "../lib/coverUrl.js";
import { fileKey, metaIdFromUrl } from "../lib/variationKeys.js";

// ───── Análisis de creativo con IA (solo imagen) ─────────────────────────
// Reusa /api/classify-ad en modo SOLO PORTADA (imageOnly) — sin Whisper, sin
// scrape de Meta: más rápido y barato (~$0,014 por creativo). Claude lee el
// texto/logo que aparezca en la imagen, así detecta la marca aunque el anuncio
// sea una colaboración creador×marca. Devuelve la clasificación completa:
// marca, nicho, ángulo, formato, nombre y descripción. knownLabels se pasa
// para que reúse etiquetas ya existentes en vez de crear duplicados.
export async function analyzeVariationWithAI(variation, knownLabels = {}) {
  const cover = variation?.file_url || null;
  if (!cover) return { ok: false, reason: "sin portada" };
  const resp = await fetch("/api/classify-ad", {
    method: "POST",
    headers: await buildApiHeaders(),
    body: JSON.stringify({ coverUrl: cover, imageOnly: true, knownLabels }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error || `Error ${resp.status}`);
  if (!data.ok) return { ok: false, reason: data.reason || "no se pudo analizar" };
  return {
    ok: true,
    labels: data.suggested_labels || {},   // { marca, nicho, angulo, formato }
    name: data.suggested_name || null,
    description: data.suggested_description || null,
    confidence: data.ai_confidence ?? null,
  };
}

// ───── Boards ────────────────────────────────────────────────────────────
// pipelineType = 'ads' | 'organic'. Cada empresa puede tener un board activo
// de cada tipo. Default 'ads' por retrocompatibilidad (todos los boards
// existentes están tagueados 'ads' por la migración).

export async function getOrCreateBoard(companyId, pipelineType = "ads") {
  const { data: existing } = await database
    .from("despliegue_boards")
    .select("*")
    .eq("company_id", companyId)
    .eq("pipeline_type", pipelineType)
    .eq("active", true)
    .maybeSingle();
  if (existing) return existing;
  const { data, error } = await database
    .from("despliegue_boards")
    .insert({ company_id: companyId, pipeline_type: pipelineType, active: true })
    .select()
    .single();
  if (error) {
    // Race condition: otra invocación concurrente lo creó entre nuestro SELECT
    // y nuestro INSERT (típicamente React StrictMode double-invoke). Si chocó
    // contra el unique index idx_despliegue_boards_company_type_active,
    // refetcheamos el row que la otra llamada acaba de crear.
    const isDuplicate = error.code === "23505" || /duplicate key/i.test(error.message || "");
    if (isDuplicate) {
      const { data: retry } = await database
        .from("despliegue_boards")
        .select("*")
        .eq("company_id", companyId)
        .eq("pipeline_type", pipelineType)
        .eq("active", true)
        .maybeSingle();
      if (retry) return retry;
    }
    throw error;
  }
  return data;
}

export async function getBoardByCompany(companyId, pipelineType = "ads") {
  const { data } = await database
    .from("despliegue_boards")
    .select("*")
    .eq("company_id", companyId)
    .eq("pipeline_type", pipelineType)
    .eq("active", true)
    .maybeSingle();
  return data || null;
}

// Actualiza la config JSONB del board (cadencia, distribución, etc.).
export async function updateBoardConfig(boardId, config) {
  const { data, error } = await database
    .from("despliegue_boards")
    .update({ config, updated_at: new Date().toISOString() })
    .eq("id", boardId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Actualiza solo la sección `labels` dentro de config, preservando el resto.
// `labels` contiene overrides para el título del board y las etiquetas de stage.
export async function updateBoardLabels(boardId, labels) {
  const { data: existing, error: e1 } = await database
    .from("despliegue_boards")
    .select("config")
    .eq("id", boardId)
    .single();
  if (e1) throw e1;
  const newConfig = { ...(existing?.config || {}), labels: { ...(existing?.config?.labels || {}), ...labels } };
  return updateBoardConfig(boardId, newConfig);
}

// Distribuye metas semanales entre los conceptos activos. Reparte equal-split
// dentro de cada stage según el total de creativos calculado para ese stage.
// Ej: si TOFU tiene 28 creativos totales y 4 conceptos, cada concepto recibe 7.
// Redondeo: ceil en el primer concepto, floor en los demás para sumar exacto.
export async function applyTargetsToConcepts(boardId, targetsPerStage) {
  const { data: concepts, error: cErr } = await database
    .from("despliegue_concepts")
    .select("id, stage")
    .eq("board_id", boardId)
    .eq("archived", false);
  if (cErr) throw cErr;

  const byStage = {};
  for (const c of concepts || []) {
    if (!byStage[c.stage]) byStage[c.stage] = [];
    byStage[c.stage].push(c);
  }

  const updates = [];
  for (const stage of ["tofu", "mofu", "bofu"]) {
    const list = byStage[stage] || [];
    const total = Math.round(targetsPerStage[stage] || 0);
    if (list.length === 0) continue;
    const base = Math.floor(total / list.length);
    const remainder = total - base * list.length;
    list.forEach((c, i) => {
      const target = base + (i < remainder ? 1 : 0);
      updates.push(
        database
          .from("despliegue_concepts")
          .update({ weekly_target: Math.max(1, target) })
          .eq("id", c.id)
      );
    });
  }
  await Promise.all(updates);
}

// ───── Concepts ──────────────────────────────────────────────────────────

export async function listConcepts(boardId) {
  const { data, error } = await database
    .from("despliegue_concepts")
    .select("*")
    .eq("board_id", boardId)
    .eq("archived", false)
    .order("stage", { ascending: true })
    .order("format", { ascending: true })
    .order("order_index", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createConcept({ board_id, stage, format, name, description = null, execution = null, weekly_target = 3, order_index = 0 }) {
  const { data, error } = await database
    .from("despliegue_concepts")
    .insert({ board_id, stage, format, name, description, execution, weekly_target, order_index })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateConcept(id, patch) {
  const { data, error } = await database
    .from("despliegue_concepts")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function archiveConcept(id) {
  return updateConcept(id, { archived: true });
}

// Archiva (borrado suave, reversible) los conceptos VACÍOS de un board — los que no
// tienen ninguna variación (referencia). Para limpiar formatos que quedaron sin nada
// (ej. "Virales", "UGC" sin refs). Devuelve { archived, names }.
export async function archiveEmptyConcepts(boardId) {
  if (!boardId) return { archived: 0, names: [] };
  const { data: concepts, error } = await database
    .from("despliegue_concepts").select("id, name").eq("board_id", boardId).eq("archived", false);
  if (error) throw error;
  if (!concepts?.length) return { archived: 0, names: [] };
  const ids = concepts.map((c) => c.id);
  const { data: vars } = await database.from("despliegue_variations").select("concept_id").in("concept_id", ids);
  const withVars = new Set((vars || []).map((v) => v.concept_id));
  const empty = concepts.filter((c) => !withVars.has(c.id));
  if (!empty.length) return { archived: 0, names: [] };
  const { error: aErr } = await database
    .from("despliegue_concepts").update({ archived: true }).in("id", empty.map((c) => c.id));
  if (aErr) throw aErr;
  return { archived: empty.length, names: empty.map((c) => c.name) };
}

// ───── Variations ────────────────────────────────────────────────────────

// Variations (referencias) de UN concepto específico — para mostrarlas en el
// SlotModal de slots de imagen como inspiración visual.
//
// Si el concepto pertenece a un concept_group_id, también trae las variations
// de los conceptos hermanos (de otras empresas), augmentadas con
// origin_company_id / origin_company_name. Sort: own-company primero.
export async function listVariationsForConcept(conceptId) {
  if (!conceptId) return [];
  const { data: concept, error: cErr } = await database
    .from("despliegue_concepts")
    .select("id, board_id, concept_group_id")
    .eq("id", conceptId)
    .maybeSingle();
  if (cErr) throw cErr;
  if (!concept) return [];

  // Sin grupo: flow simple, augmentamos con la propia origin para consistencia.
  if (!concept.concept_group_id) {
    const { data, error } = await database
      .from("despliegue_variations")
      .select("*")
      .eq("concept_id", conceptId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return augmentSingleConceptVariations(data || [], concept.id, concept.board_id);
  }

  // Con grupo: traemos hermanos.
  const augmented = await fetchGroupVariations({
    groupId: concept.concept_group_id,
    localConceptIds: [concept.id],
    localBoardId: concept.board_id,
  });
  return augmented;
}

// Cache de portadas utilizables por meta_ad_id. Son INMUTABLES una vez subidas a
// Storage, así que cachearlas por sesión es seguro y evita re-consultar en cada
// carga de despliegue/picker. Solo se cachean hits positivos (los ausentes se
// vuelven a consultar hasta que aparezca una portada permanente).
const _coverByAdCache = new Map();

// Enriquece portadas: si un creativo (por meta_ad_id) tiene una portada utilizable
// en CUALQUIER fila gemela, la usa. Así una portada cargada en el banco se refleja
// en todas las copias (cliente incluido) aunque la suya de Meta haya vencido.
// Es aditivo: nunca borra la que ya tenía (ver isUsableCover en lib/coverUrl.js).
async function enrichCoversFromTwins(variations) {
  const adIds = [...new Set((variations || []).map((v) => v.meta_ad_id).filter(Boolean))];
  const missing = adIds.filter((id) => !_coverByAdCache.has(id));
  if (missing.length) {
    // Consulta en paralelo los ad ids no cacheados (páginas de 100).
    const pages = [];
    for (let i = 0; i < missing.length; i += 100) pages.push(missing.slice(i, i + 100));
    const results = await Promise.all(pages.map((p) => database.from("despliegue_variations").select("meta_ad_id, file_url").in("meta_ad_id", p)));
    for (const { data } of results) for (const v of data || []) {
      if (v.meta_ad_id && isUsableCover(v.file_url) && !_coverByAdCache.has(v.meta_ad_id)) _coverByAdCache.set(v.meta_ad_id, v.file_url);
    }
  }
  for (const v of variations) {
    const better = _coverByAdCache.get(v.meta_ad_id);
    if (better && !isUsableCover(v.file_url)) v.file_url = better;
  }
  return variations;
}

export async function listVariationsForBoard(boardId) {
  // 1. Conceptos de este board (con su group_id).
  const { data: concepts } = await database
    .from("despliegue_concepts")
    .select("id, concept_group_id")
    .eq("board_id", boardId);
  if (!concepts?.length) return [];

  const localConceptIds = concepts.map((c) => c.id);

  // 2. Variations propias del board.
  const { data: localVars, error } = await database
    .from("despliegue_variations")
    .select("*")
    .in("concept_id", localConceptIds)
    .order("created_at", { ascending: true });
  if (error) throw error;

  // Resolver company_id del board actual (origin de las locales).
  const localBoardCompany = await getBoardCompany(boardId);

  // Augmentar locales con origin propia.
  const localAugmented = (localVars || []).map((v) => ({
    ...v,
    origin_concept_id: v.concept_id,
    origin_company_id: localBoardCompany?.company_id || null,
    origin_company_name: localBoardCompany?.company_name || null,
  }));

  // 3. ¿Hay conceptos en grupo? Si no, devolver solo locales.
  const groupIds = [...new Set(concepts.map((c) => c.concept_group_id).filter(Boolean))];
  if (groupIds.length === 0) return enrichCoversFromTwins(localAugmented);

  // Para cada group, mapeo group_id → local concept_id.
  const groupToLocalConcept = new Map();
  for (const c of concepts) {
    if (c.concept_group_id && !groupToLocalConcept.has(c.concept_group_id)) {
      groupToLocalConcept.set(c.concept_group_id, c.id);
    }
  }

  // 4. Hermanos en OTROS boards (mismo group_id, distinto id).
  const { data: siblings } = await database
    .from("despliegue_concepts")
    .select("id, board_id, concept_group_id, archived")
    .in("concept_group_id", groupIds);

  const externalSiblings = (siblings || []).filter(
    (s) => !localConceptIds.includes(s.id) && !s.archived
  );
  if (externalSiblings.length === 0) return enrichCoversFromTwins(localAugmented);

  // 5. Resolver company_id/name de los boards externos.
  const extBoardIds = [...new Set(externalSiblings.map((s) => s.board_id))];
  const { data: extBoards } = await database
    .from("despliegue_boards")
    .select("id, company_id")
    .in("id", extBoardIds);
  const boardToCompany = new Map((extBoards || []).map((b) => [b.id, b.company_id]));
  const extCompanyIds = [...new Set([...boardToCompany.values()].filter(Boolean))];
  const { data: extCompanies } = await database
    .from("companies")
    .select("id, name")
    .in("id", extCompanyIds);
  const companyById = new Map((extCompanies || []).map((c) => [c.id, c]));

  // sibling_concept_id → { origin_company_id, origin_company_name, local_concept_id }
  const siblingMeta = new Map();
  for (const s of externalSiblings) {
    const compId = boardToCompany.get(s.board_id) || null;
    const comp = compId ? companyById.get(compId) : null;
    siblingMeta.set(s.id, {
      origin_company_id: compId,
      origin_company_name: comp?.name || null,
      local_concept_id: groupToLocalConcept.get(s.concept_group_id) || null,
    });
  }

  // 6. Variations de hermanos.
  const { data: extVars } = await database
    .from("despliegue_variations")
    .select("*")
    .in("concept_id", externalSiblings.map((s) => s.id))
    .order("created_at", { ascending: true });

  const externalAugmented = (extVars || [])
    .map((v) => {
      const meta = siblingMeta.get(v.concept_id);
      if (!meta || !meta.local_concept_id) return null; // safety
      return {
        ...v,
        origin_concept_id: v.concept_id,
        origin_company_id: meta.origin_company_id,
        origin_company_name: meta.origin_company_name,
        // Remap concept_id al concepto local equivalente del grupo —
        // así los renders existentes que filtran por concept_id las muestran
        // bajo el concepto que el viewer tiene en su board.
        concept_id: meta.local_concept_id,
      };
    })
    .filter(Boolean);

  // 7. Sort: locales primero, externos después (ya vienen ordenados por created_at).
  return enrichCoversFromTwins([...localAugmented, ...externalAugmented]);
}

// Helper: trae company_id + name del board.
async function getBoardCompany(boardId) {
  if (!boardId) return null;
  const { data: board } = await database
    .from("despliegue_boards")
    .select("id, company_id")
    .eq("id", boardId)
    .maybeSingle();
  if (!board?.company_id) return null;
  const { data: company } = await database
    .from("companies")
    .select("id, name")
    .eq("id", board.company_id)
    .maybeSingle();
  return {
    company_id: board.company_id,
    company_name: company?.name || null,
  };
}

// Helper compartido: para `listVariationsForConcept` cuando hay grupo.
async function fetchGroupVariations({ groupId, localConceptIds, localBoardId }) {
  // 1. Todos los conceptos del grupo (incluyendo el local).
  const { data: members } = await database
    .from("despliegue_concepts")
    .select("id, board_id, archived")
    .eq("concept_group_id", groupId);
  const activeMembers = (members || []).filter((m) => !m.archived);
  if (activeMembers.length === 0) return [];

  const memberIds = activeMembers.map((m) => m.id);

  // 2. Boards + companies de TODOS los miembros (incluyendo local).
  const memberBoardIds = [...new Set(activeMembers.map((m) => m.board_id))];
  const { data: boards } = await database
    .from("despliegue_boards")
    .select("id, company_id")
    .in("id", memberBoardIds);
  const boardToCompany = new Map((boards || []).map((b) => [b.id, b.company_id]));
  const memberCompanyIds = [...new Set([...boardToCompany.values()].filter(Boolean))];
  const { data: cos } = await database
    .from("companies")
    .select("id, name")
    .in("id", memberCompanyIds);
  const companyById = new Map((cos || []).map((c) => [c.id, c]));

  // 3. Variations de todos los miembros.
  const { data: vars } = await database
    .from("despliegue_variations")
    .select("*")
    .in("concept_id", memberIds)
    .order("created_at", { ascending: true });

  const localCompanyId = boardToCompany.get(localBoardId) || null;
  const conceptToCompany = new Map();
  for (const m of activeMembers) {
    conceptToCompany.set(m.id, boardToCompany.get(m.board_id) || null);
  }

  const augmented = (vars || []).map((v) => {
    const compId = conceptToCompany.get(v.concept_id);
    const comp = compId ? companyById.get(compId) : null;
    return {
      ...v,
      origin_concept_id: v.concept_id,
      origin_company_id: compId || null,
      origin_company_name: comp?.name || null,
      // Remap a un concepto local del grupo (el primero) para consistencia.
      concept_id: localConceptIds[0],
    };
  });

  // Sort: locales primero (origin_company_id === localCompanyId), luego externos.
  augmented.sort((a, b) => {
    const aOwn = a.origin_company_id === localCompanyId ? 0 : 1;
    const bOwn = b.origin_company_id === localCompanyId ? 0 : 1;
    if (aOwn !== bOwn) return aOwn - bOwn;
    return new Date(a.created_at) - new Date(b.created_at);
  });

  return augmented;
}

// Helper: augmenta variations de un concepto sin grupo con su origin propia.
async function augmentSingleConceptVariations(vars, conceptId, boardId) {
  if (!vars.length) return [];
  const meta = await getBoardCompany(boardId);
  return vars.map((v) => ({
    ...v,
    origin_concept_id: v.concept_id,
    origin_company_id: meta?.company_id || null,
    origin_company_name: meta?.company_name || null,
  }));
}

export async function createVariation(payload) {
  const { data, error } = await database
    .from("despliegue_variations")
    .insert({
      ...payload,
      produced_at: payload.state && payload.state !== "pending" ? new Date().toISOString() : null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Pone la portada de un referente y la PROPAGA a sus copias en otros boards.
//
// El mismo anuncio vive en varias filas: la del banco y una copia por cada
// cliente al que se lo importaste. No hay FK entre ellas — se reconocen por el id
// del anuncio de Meta o por el archivo de video, que la copia hereda verbatim.
//
// Sin esto, arreglar una portada en el banco no se veía en el portal del cliente
// hasta volver a importar el concepto a mano. Con esto, una sola vez alcanza.
//
// Solo RELLENA: nunca pisa una portada que la copia ya tenga y sirva.
export async function setVariationCover(id, url) {
  const cover = (url || "").trim();
  if (!id || !cover) return { updated: 0, propagated: 0 };
  const { data: row } = await database
    .from("despliegue_variations")
    .select("id, file_url, drive_url, meta_ad_id, meta_ads_library_url")
    .eq("id", id).maybeSingle();

  await updateVariation(id, { file_url: cover });
  const propagated = row ? await propagateCoverFrom({ ...row, file_url: cover }) : 0;
  return { updated: 1, propagated };
}

// Copia la portada de `row` a las filas hermanas que no tengan una utilizable.
export async function propagateCoverFrom(row) {
  const cover = (row?.file_url || "").trim();
  if (!cover || !isUsableCover(cover)) return 0;

  const adId = row.meta_ad_id || metaIdFromUrl(row.meta_ads_library_url);
  const vidKey = fileKey(row.drive_url);
  if (!adId && !vidKey) return 0;   // sin clave no hay forma de saber quién es hermana

  // Se busca por el id de Meta (exacto) y por el video (el nombre de archivo es
  // único porque lleva timestamp + random al subirse).
  const queries = [];
  if (adId) queries.push(database.from("despliegue_variations").select("id, file_url").eq("meta_ad_id", adId).neq("id", row.id));
  if (vidKey && row.drive_url) queries.push(database.from("despliegue_variations").select("id, file_url, drive_url").eq("drive_url", row.drive_url).neq("id", row.id));
  const results = await Promise.all(queries);

  const seen = new Set();
  const targets = [];
  for (const { data } of results) {
    for (const v of data || []) {
      if (seen.has(v.id)) continue;
      seen.add(v.id);
      if (!isUsableCover(v.file_url)) targets.push(v.id);   // solo rellenar
    }
  }
  if (!targets.length) return 0;

  const { error } = await database
    .from("despliegue_variations")
    .update({ file_url: cover, updated_at: new Date().toISOString() })
    .in("id", targets);
  if (error) { console.error("propagar portada falló", error); return 0; }
  return targets.length;
}

export async function updateVariation(id, patch) {
  const update = { ...patch, updated_at: new Date().toISOString() };
  // Si cambió de pending → algo, marcar produced_at si aún no lo tiene.
  if (patch.state && patch.state !== "pending" && !patch.produced_at) {
    update.produced_at = new Date().toISOString();
  }
  const { data, error } = await database
    .from("despliegue_variations")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteVariation(id) {
  const { error } = await database.from("despliegue_variations").delete().eq("id", id);
  if (error) throw error;
}

// Borra varias variations de una. Usado por el Modo lista (acciones en masa).
export async function deleteVariationsBulk(ids) {
  if (!ids?.length) return { count: 0 };
  const { error } = await database.from("despliegue_variations").delete().in("id", ids);
  if (error) throw error;
  return { count: ids.length };
}

// ───── Borrado DEFINITIVO de conceptos (NO archivar) ──────────────────────
// A diferencia de archiveConcept (soft, reversible), esto ELIMINA la fila de
// despliegue_concepts; sus despliegue_variations caen por ON DELETE CASCADE.
// Irreversible. Solo toca la fila con este id — es decir, SOLO el concepto de
// ESTE board. Si el concepto comparte concept_group_id con hermanos de otras
// empresas o del banco (company_id="bank_refs"), esos hermanos NO se tocan:
// viven en otros boards con sus propias filas/ids. Usado por el modo selección
// del despliegue admin para vaciar/rehacer el despliegue de un cliente.
export async function deleteConcept(id) {
  if (!id) return { count: 0 };
  // `.select()` devuelve las filas efectivamente borradas → si RLS o un FK lo
  // bloquean, count queda en 0 en vez de fallar en silencio.
  const { data, error } = await database
    .from("despliegue_concepts")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw error;
  return { count: (data || []).length };
}

// Igual que deleteConcept pero para varios ids en una sola query. Todos los ids
// deben ser conceptos del board del cliente (los que el admin ve en su tablero);
// el banco es otro board con otras filas y no se ve afectado.
export async function deleteConceptsBulk(ids) {
  if (!ids?.length) return { count: 0 };
  const { data, error } = await database
    .from("despliegue_concepts")
    .delete()
    .in("id", ids)
    .select("id");
  if (error) throw error;
  return { count: (data || []).length };
}

// Aplica altas y bajas de etiquetas por categoría a varias variations.
// added/removed = { categoria: [valores] }. Añade (unión) y quita, preservando
// los valores propios de cada ref que no estén en el delta. Merge por fila.
// Para 1 sola ref equivale a un "set" exacto; para varias es un edit no destructivo.
export async function applyLabelDelta(ids, added = {}, removed = {}) {
  if (!ids?.length) return { count: 0 };
  const cats = [...new Set([...Object.keys(added), ...Object.keys(removed)])];
  const hasChanges = cats.some((c) => (added[c]?.length || 0) + (removed[c]?.length || 0) > 0);
  if (!hasChanges) return { count: 0 };
  const { data: rows, error } = await database
    .from("despliegue_variations")
    .select("id, bank_labels")
    .in("id", ids);
  if (error) throw error;
  await Promise.all((rows || []).map((r) => {
    const labels = { ...(r.bank_labels || {}) };
    for (const cat of cats) {
      let arr = Array.isArray(labels[cat]) ? [...labels[cat]] : [];
      const rem = removed[cat] || [];
      if (rem.length) arr = arr.filter((v) => !rem.includes(v));
      // Dedup por clave normalizada: si ya existe un valor normLabel-igual, se reusa
      // el existente (no se crea "ryze" junto a "Ryze", ni "angulo" junto a "Ángulo").
      for (const v of (added[cat] || [])) arr = mergeLabelValue(arr, v);
      labels[cat] = arr;
    }
    return database
      .from("despliegue_variations")
      .update({ bank_labels: labels, updated_at: new Date().toISOString() })
      .eq("id", r.id);
  }));
  return { count: (rows || []).length };
}

// ───── Administración GLOBAL de etiquetas (rename / merge / mover / borrar) ─────
// Las etiquetas viven en DOS lados: el BANCO (`despliegue_variations.bank_labels`)
// y la BANDEJA (`reference_inbox.suggested_labels`). Toda operación de organización
// se aplica a AMBOS para que queden unificadas en todos lados (antes solo tocaba el
// banco → la bandeja acumulaba variantes duplicadas).
const LABEL_STORES = [
  { table: "despliegue_variations", col: "bank_labels", touchUpdated: true },
  { table: "reference_inbox", col: "suggested_labels", touchUpdated: false }, // updated_at por trigger
];

// Corre una transformación de etiquetas sobre las filas afectadas de AMBOS stores.
//   matches(labels)   → ¿esta fila hay que tocarla?
//   transform(labels) → objeto de etiquetas nuevo
// Progreso combinado (done/total sobre los dos stores). Devuelve { count }.
async function applyLabelChange(matches, transform, onProgress = null) {
  const jobs = [];
  for (const store of LABEL_STORES) {
    const { data: rows, error } = await database
      .from(store.table).select(`id, ${store.col}`).not(store.col, "is", null).limit(20000);
    if (error) throw error;
    for (const r of rows || []) {
      const labels = r[store.col] || {};
      if (matches(labels)) jobs.push({ store, id: r.id, labels });
    }
  }
  let done = 0;
  for (const j of jobs) {
    const upd = { [j.store.col]: transform(j.labels) };
    if (j.store.touchUpdated) upd.updated_at = new Date().toISOString();
    await database.from(j.store.table).update(upd).eq("id", j.id);
    onProgress?.(++done, jobs.length);
  }
  return { count: jobs.length };
}

// Renombra/unifica valores de una categoría en TODO (banco + bandeja). `fromValues`
// (uno o varios) → `to`. Case-insensitive (colapsa "ryze"/"RYZE"→"Ryze"). Dedupea.
export async function mergeLabelValues(category, fromValues, to, onProgress = null) {
  const froms = (Array.isArray(fromValues) ? fromValues : [fromValues]).map((s) => (s || "").trim()).filter(Boolean);
  const target = (to || "").trim();
  if (!category || !froms.length || !target) return { count: 0 };
  const fromKeys = new Set(froms.map(normLabel));
  const matches = (labels) => {
    const arr = labels?.[category];
    return Array.isArray(arr) && arr.some((v) => fromKeys.has(normLabel(v)));
  };
  const transform = (labels) => {
    const out = { ...(labels || {}) };
    const arr = Array.isArray(out[category]) ? out[category] : [];
    const seen = new Set(); const res = [];
    for (const v of arr) {
      const val = fromKeys.has(normLabel(v)) ? target : v;
      const k = normLabel(val);
      if (!k || seen.has(k)) continue;
      seen.add(k); res.push(val);
    }
    out[category] = res;
    return out;
  };
  return applyLabelChange(matches, transform, onProgress);
}

// Renombrar = merge de un solo valor.
export async function renameLabelValue(category, from, to, onProgress = null) {
  return mergeLabelValues(category, [from], to, onProgress);
}

// Mueve un valor de una categoría a OTRA en todo (banco + bandeja) — ej. "Bajar de
// peso" de nicho → ángulo. Lo saca de `fromCat` y lo agrega a `toCat` (dedup).
export async function moveLabelToCategory(fromCat, value, toCat, onProgress = null) {
  const val = (value || "").trim();
  if (!fromCat || !toCat || fromCat === toCat || !val) return { count: 0 };
  const key = normLabel(val);
  const matches = (labels) => {
    const arr = labels?.[fromCat];
    return Array.isArray(arr) && arr.some((v) => normLabel(v) === key);
  };
  const transform = (labels) => {
    const out = { ...(labels || {}) };
    out[fromCat] = (Array.isArray(out[fromCat]) ? out[fromCat] : []).filter((v) => normLabel(v) !== key);
    const dest = Array.isArray(out[toCat]) ? [...out[toCat]] : [];
    if (!dest.some((v) => normLabel(v) === key)) dest.push(val);
    out[toCat] = dest;
    return out;
  };
  return applyLabelChange(matches, transform, onProgress);
}

// Elimina un valor de una categoría en todo (banco + bandeja).
export async function deleteLabelValue(category, value, onProgress = null) {
  const val = normLabel(value);
  if (!category || !val) return { count: 0 };
  const matches = (labels) => {
    const arr = labels?.[category];
    return Array.isArray(arr) && arr.some((v) => normLabel(v) === val);
  };
  const transform = (labels) => {
    const out = { ...(labels || {}) };
    out[category] = (Array.isArray(out[category]) ? out[category] : []).filter((v) => normLabel(v) !== val);
    return out;
  };
  return applyLabelChange(matches, transform, onProgress);
}

// Agrega valores de etiqueta a una categoría de `bank_labels` en varias variations
// a la vez (unión con lo que ya tengan). Merge por fila porque Postgres no hace
// unión de arrays jsonb en un UPDATE plano. Compartido por banco y despliegue.
export async function addLabelsToVariations(ids, category, values) {
  const clean = (values || []).map((t) => (t || "").trim().replace(/\s+/g, " ")).filter(Boolean);
  if (!ids?.length || !category || !clean.length) return { count: 0 };
  const { data: rows, error } = await database
    .from("despliegue_variations")
    .select("id, bank_labels")
    .in("id", ids);
  if (error) throw error;
  await Promise.all((rows || []).map((r) => {
    const labels = { ...(r.bank_labels || {}) };
    const existing = Array.isArray(labels[category]) ? labels[category] : [];
    // Unión con dedup por clave normalizada (mayúsculas/acentos): reusa el valor ya
    // guardado en vez de agregar una variante nueva ("Ryze"/"ryze" → una sola).
    let merged = [...existing];
    for (const val of clean) merged = mergeLabelValue(merged, val);
    labels[category] = merged;
    return database
      .from("despliegue_variations")
      .update({ bank_labels: labels, updated_at: new Date().toISOString() })
      .eq("id", r.id);
  }));
  return { count: (rows || []).length };
}
