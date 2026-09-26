import { database } from "../../lib/backend.js";
import { updateConcept, createConcept, createVariation, getOrCreateBoard, getBoardByCompany, listConcepts, updateVariation } from "../../despliegue/db.js";
import { variationMatches, hasActiveFilters, LABEL_CATEGORIES } from "../../despliegue/labels.js";
import { buildApiHeaders } from "../../lib/apiAuth.js";
import { variationVideoUrl } from "../../lib/driveLinks.js";
import { coverIsExpired, videoIsCanvasReadable, bestCover, isUsableCover, isOwnStorage } from "../../lib/coverUrl.js";
import { identityKeys } from "../../lib/variationKeys.js";
import { buildKnownFormats, buildKnownLabels, apifyScrapeBrand, driveBackupFromUrl } from "../inbox/inboxDb.js";
import { uploadCoverBlob } from "../../despliegue/storage.js";
import { extractVideoCoverFromUrl } from "../../lib/videoFrame.js";
import { logger } from "../../lib/logger.js";

// Vocabulario GLOBAL de etiquetas (marca/nicho/ángulo/formato): todos los valores
// distintos usados en cualquier referencia del banco. Para autocompletar y para
// los filtros de import por etiqueta (que queden conectados entre conceptos).
export async function fetchLabelVocabulary() {
  const out = {}; for (const c of LABEL_CATEGORIES) out[c.key] = new Set();   // incluye subnicho
  const add = (rows, col) => {
    for (const r of rows || []) {
      const l = r[col] || {};
      for (const c of LABEL_CATEGORIES) for (const v of (Array.isArray(l[c.key]) ? l[c.key] : [])) if (v) out[c.key].add(v);
    }
  };
  // Vocabulario UNIDO: banco (variaciones) + bandeja (referentes) → una sola lista.
  const [bank, inbox] = await Promise.all([
    database.from("despliegue_variations").select("bank_labels").not("bank_labels", "is", null).limit(10000),
    database.from("reference_inbox").select("suggested_labels").not("suggested_labels", "is", null).limit(10000),
  ]);
  if (bank.error) throw bank.error;
  add(bank.data, "bank_labels");
  if (!inbox.error) add(inbox.data, "suggested_labels");   // bandeja best-effort
  const res = {};
  for (const c of LABEL_CATEGORIES) res[c.key] = [...out[c.key]].sort((a, b) => a.localeCompare(b));
  return res;
}

// Vocabulario GLOBAL con CONTEO por valor (para el administrador de etiquetas):
// { marca:[{value,count}], nicho:[...], angulo:[...], formato:[...] } ordenado por
// count desc. Cuenta cuántas referencias usan cada valor.
export async function fetchLabelVocabularyCounted() {
  const counters = {}; for (const c of LABEL_CATEGORIES) counters[c.key] = new Map();   // incluye subnicho
  const add = (rows, col) => {
    for (const r of rows || []) {
      const l = r[col] || {};
      for (const c of LABEL_CATEGORIES) {
        for (const v of (Array.isArray(l[c.key]) ? l[c.key] : [])) {
          const val = (v || "").toString().trim();
          if (!val) continue;
          counters[c.key].set(val, (counters[c.key].get(val) || 0) + 1);
        }
      }
    }
  };
  // Conteos UNIDOS: banco (variaciones) + bandeja (referentes).
  const [bank, inbox] = await Promise.all([
    database.from("despliegue_variations").select("bank_labels").not("bank_labels", "is", null).limit(20000),
    database.from("reference_inbox").select("suggested_labels").not("suggested_labels", "is", null).limit(20000),
  ]);
  if (bank.error) throw bank.error;
  add(bank.data, "bank_labels");
  if (!inbox.error) add(inbox.data, "suggested_labels");   // bandeja best-effort
  const res = {};
  for (const c of LABEL_CATEGORIES) {
    res[c.key] = [...counters[c.key].entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  }
  return res;
}

// Empresa-centinela para material creado DIRECTO en el banco (no de un cliente).
// company_id de despliegue_boards es TEXT sin FK, así que este board vive solo
// para el banco: no crea fila en `companies` → invisible en Empresas/Finanzas/etc.
export const BANK_REFS_COMPANY_ID = "bank_refs";
export const BANK_REFS_COMPANY_NAME = "Banco de referencias";

// Banco de creativos: vista cross-company sobre despliegue_concepts.
// No hay tabla nueva — los conceptos del banco son TODOS los concepts no
// archivados de boards activos, agrupados con metadata de la empresa origen
// (nombre, slug, nicho) para filtrar y previsualizar.
//
// Importar = clonar el concept y sus variations al board destino. Mantiene
// las URLs públicas (file_url) apuntando al bucket original — es seguro
// porque el bucket es public.

// Lista todos los conceptos disponibles en el banco. Devuelve cada uno con
// su empresa origen, nicho, pipeline_type y conteo/preview de variations.
//
// Implementación: hacemos 4 queries simples y joineamos en cliente. Es más
// rápido y predecible que un join nested en Supabase con filters cruzados.
export async function listBankConcepts() {
  // 1. Boards activos (todos los pipeline_types)
  const { data: boards, error: be } = await database
    .from("despliegue_boards")
    .select("id, company_id, pipeline_type")
    .eq("active", true);
  if (be) throw be;
  if (!boards?.length) return [];

  const boardIds = boards.map((b) => b.id);
  const companyIds = [...new Set(boards.map((b) => b.company_id))];

  // 2. Concepts no archivados Y no excluidos del banco
  const { data: concepts, error: ce } = await database
    .from("despliegue_concepts")
    .select("id, board_id, stage, format, name, description, execution, weekly_target, created_at, bank_hidden, concept_group_id, bank_tags")
    .in("board_id", boardIds)
    .eq("archived", false)
    .eq("bank_hidden", false)
    .order("created_at", { ascending: false });
  if (ce) throw ce;
  if (!concepts?.length) return [];

  const conceptIds = concepts.map((c) => c.id);

  // 3. Variations de esos concepts (todas — para count + thumb preview)
  const { data: variations, error: ve } = await database
    .from("despliegue_variations")
    .select("id, concept_id, file_url, state")
    .in("concept_id", conceptIds);
  if (ve) throw ve;

  // 3b. Para conceptos con group_id, contar miembros + refs totales del grupo.
  const groupIds = [...new Set(concepts.map((c) => c.concept_group_id).filter(Boolean))];
  const groupInfoMap = new Map(); // group_id → { count, companyCount, varsCount }
  if (groupIds.length > 0) {
    const { data: members } = await database
      .from("despliegue_concepts")
      .select("id, board_id, concept_group_id")
      .in("concept_group_id", groupIds)
      .eq("archived", false);
    const memberIds = (members || []).map((m) => m.id);
    const memberBoardIds = [...new Set((members || []).map((m) => m.board_id))];
    const [{ data: memberBoards }, { data: memberVars }] = await Promise.all([
      database.from("despliegue_boards").select("id, company_id").in("id", memberBoardIds),
      database.from("despliegue_variations").select("id, concept_id, file_url").in("concept_id", memberIds),
    ]);
    const memberBoardCompany = new Map((memberBoards || []).map((b) => [b.id, b.company_id]));
    const conceptToGroup = new Map((members || []).map((m) => [m.id, m.concept_group_id]));
    // Variations por grupo, deduped por file_url.
    const groupVarKeys = new Map(); // group_id → Set<file_url|id>
    for (const v of memberVars || []) {
      const gid = conceptToGroup.get(v.concept_id);
      if (!gid) continue;
      if (!groupVarKeys.has(gid)) groupVarKeys.set(gid, new Set());
      groupVarKeys.get(gid).add(v.file_url || v.id);
    }
    for (const gid of groupIds) {
      const members_ = (members || []).filter((m) => m.concept_group_id === gid);
      const companies_ = new Set(members_.map((m) => memberBoardCompany.get(m.board_id)).filter(Boolean));
      groupInfoMap.set(gid, {
        count: members_.length,
        companyCount: companies_.size,
        varsCount: groupVarKeys.get(gid)?.size || 0,
      });
    }
  }

  // 4. Companies + niche en paralelo
  const [{ data: companies }, { data: voices }] = await Promise.all([
    database.from("companies").select("id, name, slug").in("id", companyIds),
    database.from("company_voice_profile").select("company_id, niche").in("company_id", companyIds),
  ]);

  const boardById = new Map(boards.map((b) => [b.id, b]));
  const companyById = new Map((companies || []).map((c) => [c.id, c]));
  const nicheById = new Map((voices || []).map((v) => [v.company_id, v.niche || null]));
  const variationsByConcept = new Map();
  for (const v of variations || []) {
    if (!variationsByConcept.has(v.concept_id)) variationsByConcept.set(v.concept_id, []);
    variationsByConcept.get(v.concept_id).push(v);
  }

  return concepts.map((c) => {
    const board = boardById.get(c.board_id);
    const company = board ? companyById.get(board.company_id) : null;
    const isBankRef = board?.company_id === BANK_REFS_COMPANY_ID;
    const vs = variationsByConcept.get(c.id) || [];
    const firstWithImage = vs.find((v) => v.file_url);
    const groupInfo = c.concept_group_id ? groupInfoMap.get(c.concept_group_id) : null;
    return {
      ...c,
      bank_tags: c.bank_tags || [],
      board_id: board?.id || null,
      pipeline_type: board?.pipeline_type || "ads",
      company_id: company?.id || (isBankRef ? BANK_REFS_COMPANY_ID : null),
      company_name: company?.name || (isBankRef ? BANK_REFS_COMPANY_NAME : "—"),
      company_slug: company?.slug || null,
      is_bank_ref: isBankRef,
      niche: nicheById.get(company?.id) || null,
      variations_count: vs.length,
      thumb_url: firstWithImage?.file_url || null,
      // Si el concepto pertenece a un grupo, exposemos contadores.
      group_member_count: groupInfo?.count || 0,
      group_company_count: groupInfo?.companyCount || 0,
      group_variations_count: groupInfo?.varsCount || 0,
    };
  });
}

// Lista TODAS las referencias (variations) del banco de un pipeline (ads/organic)
// en plano, con info de su concepto y empresa. Para la vista de "Referencias"
// con multi-selección + retag masivo (arreglar etiquetas equivocadas en bloque).
// LIVIANA: solo lo necesario para poblar el filtro de NICHO del banco al montar
// (concept_id + bank_labels). NO trae transcript/notes/file_url — que en
// listBankVariations pesan megas por las transcripciones de todos los creativos
// de todas las empresas. Esta era la causa #1 de la lentitud del banco.
export async function listBankNicheLabels(pipelineType = "ads") {
  const { data: boards, error: be } = await database
    .from("despliegue_boards").select("id, pipeline_type").eq("active", true);
  if (be) throw be;
  const boardIds = (boards || []).filter((b) => (b.pipeline_type || "ads") === pipelineType).map((b) => b.id);
  if (!boardIds.length) return [];
  const { data: concepts, error: ce } = await database
    .from("despliegue_concepts").select("id")
    .in("board_id", boardIds).eq("archived", false).eq("bank_hidden", false);
  if (ce) throw ce;
  const conceptIds = (concepts || []).map((c) => c.id);
  if (!conceptIds.length) return [];
  const { data: variations, error: ve } = await database
    .from("despliegue_variations").select("concept_id, bank_labels")
    .in("concept_id", conceptIds);
  if (ve) throw ve;
  return (variations || []).map((v) => ({ concept_id: v.concept_id, bank_labels: v.bank_labels || {} }));
}

export async function listBankVariations(pipelineType = "ads") {
  const { data: boards, error: be } = await database
    .from("despliegue_boards").select("id, company_id, pipeline_type").eq("active", true);
  if (be) throw be;
  const kindBoards = (boards || []).filter((b) => (b.pipeline_type || "ads") === pipelineType);
  const boardIds = kindBoards.map((b) => b.id);
  if (!boardIds.length) return [];
  const companyIds = [...new Set(kindBoards.map((b) => b.company_id))];

  const { data: concepts, error: ce } = await database
    .from("despliegue_concepts").select("id, board_id, stage, format, name")
    .in("board_id", boardIds).eq("archived", false).eq("bank_hidden", false);
  if (ce) throw ce;
  if (!concepts?.length) return [];
  const conceptIds = concepts.map((c) => c.id);

  const { data: variations, error: ve } = await database
    .from("despliegue_variations")
    .select("id, concept_id, label, name, state, file_url, drive_url, meta_ads_library_url, bank_labels, notes, transcript, created_at")
    .in("concept_id", conceptIds)
    .order("created_at", { ascending: false });
  if (ve) throw ve;

  const { data: companies } = await database.from("companies").select("id, name").in("id", companyIds);
  const boardById = new Map(kindBoards.map((b) => [b.id, b]));
  const companyById = new Map((companies || []).map((c) => [c.id, c]));
  const conceptById = new Map(concepts.map((c) => [c.id, c]));

  return (variations || []).map((v) => {
    const c = conceptById.get(v.concept_id);
    const board = c ? boardById.get(c.board_id) : null;
    const company = board ? companyById.get(board.company_id) : null;
    const isBankRef = board?.company_id === BANK_REFS_COMPANY_ID;
    return {
      ...v,
      bank_labels: v.bank_labels || {},
      concept_name: c?.name || null,
      concept_stage: c?.stage || null,
      concept_format: c?.format || null,
      company_id: board?.company_id || null,
      company_name: company?.name || (isBankRef ? BANK_REFS_COMPANY_NAME : "—"),
    };
  });
}

// Deduplica una lista de variations por `file_url` (mismo archivo = mismo
// creativo). Conserva la PRIMERA aparición — como pasamos las propias primero,
// la copia que queda es la propia (la que sí se puede mover/eliminar). Las
// variations sin file_url nunca se colapsan (se identifican por id).
// Devuelve { variations, duplicatesHidden }.
function dedupeVariationsByFile(vars) {
  const seen = new Set();
  const out = [];
  let duplicatesHidden = 0;
  for (const v of vars) {
    const key = v.file_url || `__id__${v.id}`;
    if (seen.has(key)) {
      duplicatesHidden += 1;
      continue;
    }
    seen.add(key);
    out.push(v);
  }
  return { variations: out, duplicatesHidden };
}

// Trae el detalle completo de un concept del banco — sus variations con
// todos los campos.
//
// Si el concepto tiene `concept_group_id`, también trae las variations de
// los hermanos del grupo (de otras empresas), cada una augmentada con
// `origin_company_id` / `origin_company_name`. Sort: propias primero,
// después externas. Las copias idénticas (mismo file_url) entre la empresa
// propia y las hermanas se colapsan a una sola, conservando la propia, para
// que cada creativo aparezca una única vez y con su botón de eliminar.
// Retorna también `groupMembers` con info de las empresas del grupo y
// `duplicatesHidden` (cuántas copias repetidas se ocultaron) para el header.
export async function getBankConceptDetail(conceptId) {
  if (!conceptId) return null;
  const { data: concept, error: ce } = await database
    .from("despliegue_concepts")
    .select("*")
    .eq("id", conceptId)
    .maybeSingle();
  if (ce) throw ce;
  if (!concept) return null;

  // Resolver company del concepto actual (para sort own-first y mostrar info).
  const { data: ownBoard } = await database
    .from("despliegue_boards")
    .select("id, company_id")
    .eq("id", concept.board_id)
    .maybeSingle();
  const ownCompanyId = ownBoard?.company_id || null;
  const { data: ownCompany } = ownCompanyId
    ? await database.from("companies").select("id, name").eq("id", ownCompanyId).maybeSingle()
    : { data: null };

  // Refs propias del concepto.
  const { data: ownVars, error: ve } = await database
    .from("despliegue_variations")
    .select("*")
    .eq("concept_id", conceptId)
    .order("created_at", { ascending: true });
  if (ve) throw ve;

  const augmentedOwn = (ownVars || []).map((v) => ({
    ...v,
    origin_concept_id: v.concept_id,
    origin_company_id: ownCompanyId,
    origin_company_name: ownCompany?.name || null,
  }));

  // Si no hay grupo, devolver solo las propias.
  if (!concept.concept_group_id) {
    return {
      concept,
      variations: augmentedOwn,
      groupMembers: [],
      duplicatesHidden: 0,
    };
  }

  // Hay grupo: traer hermanos.
  const { data: members } = await database
    .from("despliegue_concepts")
    .select("id, board_id, archived")
    .eq("concept_group_id", concept.concept_group_id);
  const activeSiblings = (members || []).filter((m) => !m.archived && m.id !== concept.id);

  if (activeSiblings.length === 0) {
    return {
      concept,
      variations: augmentedOwn,
      groupMembers: [{
        concept_id: concept.id,
        company_id: ownCompanyId,
        company_name: ownCompany?.name || null,
      }],
      duplicatesHidden: 0,
    };
  }

  // Resolver company de cada hermano.
  const sibBoardIds = [...new Set(activeSiblings.map((s) => s.board_id))];
  const { data: sibBoards } = await database
    .from("despliegue_boards")
    .select("id, company_id")
    .in("id", sibBoardIds);
  const boardToCompany = new Map((sibBoards || []).map((b) => [b.id, b.company_id]));
  const sibCompanyIds = [...new Set([...boardToCompany.values()].filter(Boolean))];
  const { data: sibCompanies } = await database
    .from("companies")
    .select("id, name")
    .in("id", sibCompanyIds);
  const companyById = new Map((sibCompanies || []).map((c) => [c.id, c]));

  const sibConceptToCompany = new Map();
  for (const s of activeSiblings) {
    const compId = boardToCompany.get(s.board_id) || null;
    sibConceptToCompany.set(s.id, compId);
  }

  // Refs de hermanos.
  const { data: sibVars } = await database
    .from("despliegue_variations")
    .select("*")
    .in("concept_id", activeSiblings.map((s) => s.id))
    .order("created_at", { ascending: true });

  const augmentedSiblings = (sibVars || []).map((v) => {
    const compId = sibConceptToCompany.get(v.concept_id) || null;
    const comp = compId ? companyById.get(compId) : null;
    return {
      ...v,
      origin_concept_id: v.concept_id,
      origin_company_id: compId,
      origin_company_name: comp?.name || null,
    };
  });

  // Agrupar info de miembros (incluyendo el propio).
  const groupMembers = [
    {
      concept_id: concept.id,
      company_id: ownCompanyId,
      company_name: ownCompany?.name || null,
    },
    ...activeSiblings.map((s) => {
      const compId = boardToCompany.get(s.board_id) || null;
      const comp = compId ? companyById.get(compId) : null;
      return {
        concept_id: s.id,
        company_id: compId,
        company_name: comp?.name || null,
      };
    }),
  ];

  // Colapsar copias idénticas (mismo file_url) entre propias y hermanas.
  // Propias van primero → la copia que sobrevive es la propia (deletable).
  const { variations: dedupedVariations, duplicatesHidden } = dedupeVariationsByFile(
    [...augmentedOwn, ...augmentedSiblings]
  );

  return {
    concept,
    variations: dedupedVariations,
    groupMembers,
    duplicatesHidden,
  };
}

// Clona un concepto del banco al board destino. Copia el concept y todas
// sus variations. Las URLs públicas se preservan (apuntan al bucket original
// que es public). El estado de las variations se resetea a 'pending' y se
// limpian campos que eran específicos de la empresa origen (meta_ad_id,
// produced_at, notes históricas).
//
// Si el concepto pertenece a un concept_group_id (vinculado cross-empresa),
// se importan también las variations de los hermanos del grupo. Cada
// variación se deduplica por file_url para no traer la misma imagen 2 veces
// si por alguna razón está en dos miembros del grupo.
//
// Si `selectedVariationIds` es null, copia todas las variations (incluyendo
// las de hermanos cuando hay grupo). Si es un array, solo copia las que
// estén en ese set.
//
// ───── Identidad de creativo (multi-señal, robusta) para dedup del import ─────
// Antes se deduplicaba por UNA sola clave (meta||file||drive) cortada en "?", y
// para links de Drive daba ".../uc" IGUAL para todos → colapsaba referencias
// distintas. Ahora identificamos por varias señales fuertes: id de anuncio, id de
// archivo de Drive, nombre de archivo de video/portada, y URL de Meta exacta.
const _GENERIC_BN = new Set(["uc", "view", "preview", "edit", "open", "download", "index"]);
function _fileKey(u) {
  if (!u || typeof u !== "string") return null;
  if (/drive\.google\.com|docs\.google\.com/i.test(u)) {
    const m = u.match(/\/d\/([\w-]{20,})|[?&]id=([\w-]{20,})/);
    return m ? `drive:${m[1] || m[2]}` : null;   // Drive → id único (no ".../uc")
  }
  let base;
  try { base = new URL(u).pathname.split("/").pop(); } catch { base = u.split("?")[0].split("/").pop(); }
  base = (base || "").toLowerCase().trim();
  if (base.length < 6) return null;
  if (_GENERIC_BN.has(base.replace(/\.[a-z0-9]+$/, ""))) return null;
  return base;
}
const _metaId = (u) => { const m = (u || "").match(/[?&]id=(\d{5,})/); return m ? m[1] : null; };
function _varKeys(v) {
  const keys = [];
  // OJO: NO usar la URL de Meta como clave "src" — el id va en el query (?id=XXX)
  // y `facebook.com/ads/library/` es IGUAL para todos → juntaría TODO. El id del
  // anuncio (ad:) YA identifica de forma única cada creativo de Meta.
  const adId = v.meta_ad_id || _metaId(v.meta_ads_library_url);
  if (adId) keys.push(`ad:${adId}`);
  const vk = _fileKey(v.drive_url); if (vk) keys.push(`vid:${vk}`);
  const ck = _fileKey(v.file_url); if (ck) keys.push(`cov:${ck}`);
  return keys;
}
// Agrupa por componentes conexos (union-find) usando _varKeys. Grupos con >1.
function _groupDupes(rows) {
  const parent = new Map();
  const find = (x) => { let r = x; while (parent.get(r) !== r) r = parent.get(r); while (parent.get(x) !== r) { const n = parent.get(x); parent.set(x, r); x = n; } return r; };
  const ens = (k) => { if (!parent.has(k)) parent.set(k, k); };
  const uni = (a, b) => { ens(a); ens(b); parent.set(find(a), find(b)); };
  for (const row of rows) { const anc = `row:${row.id}`; ens(anc); for (const k of _varKeys(row)) uni(anc, k); }
  const groups = new Map();
  for (const row of rows) { const rt = find(`row:${row.id}`); if (!groups.has(rt)) groups.set(rt, []); groups.get(rt).push(row); }
  return [...groups.values()].filter((g) => g.length > 1);
}

export async function importConceptToBoard({ sourceConceptId, targetBoardId, selectedVariationIds = null, labelFilter = null }) {
  if (!sourceConceptId) throw new Error("sourceConceptId es requerido");
  if (!targetBoardId) throw new Error("targetBoardId es requerido");

  const detail = await getBankConceptDetail(sourceConceptId);
  if (!detail) throw new Error("Concepto no encontrado en el banco");

  const { concept, variations } = detail;

  // Si el concepto está vinculado a un grupo, también traemos las refs
  // de los hermanos. Dedupe por file_url.
  let allVariations = variations || [];
  if (concept.concept_group_id) {
    const { data: siblings } = await database
      .from("despliegue_concepts")
      .select("id")
      .eq("concept_group_id", concept.concept_group_id)
      .eq("archived", false)
      .neq("id", concept.id);
    const siblingIds = (siblings || []).map((s) => s.id);
    if (siblingIds.length > 0) {
      const { data: siblingVars } = await database
        .from("despliegue_variations")
        .select("*")
        .in("concept_id", siblingIds)
        .order("created_at", { ascending: true });
      // Dedupe por file_url (si está) o id.
      const seen = new Set(allVariations.map((v) => v.file_url || v.id));
      for (const v of siblingVars || []) {
        const key = v.file_url || v.id;
        if (!seen.has(key)) {
          seen.add(key);
          allVariations.push(v);
        }
      }
    }
  }

  // Qué variations copiar: subconjunto explícito (selectedVariationIds) y/o
  // filtro por ETIQUETA (marca/nicho/ángulo/formato). Se calcula ANTES de crear
  // el concepto para no clonar un concepto vacío cuando el filtro no matchea nada.
  let variationsToCopy = allVariations;
  if (selectedVariationIds) {
    variationsToCopy = variationsToCopy.filter((v) => selectedVariationIds.includes(v.id));
  }
  if (labelFilter && hasActiveFilters(labelFilter)) {
    variationsToCopy = variationsToCopy.filter((v) => variationMatches(v, labelFilter));
    // Con filtro activo, un concepto sin refs que matcheen no se importa.
    if (variationsToCopy.length === 0) {
      return { newConceptId: null, variationsCopied: 0, skipped: true };
    }
  }

  // ── IDEMPOTENTE: dedup + REFRESCO contra el board destino ──
  // Las refs que el cliente YA tiene (por file_url||drive_url||meta) NO se duplican:
  // se REFRESCAN con la data fresca del banco (notas/guion/video/etiquetas). Las
  // nuevas se insertan. Así re-importar = sincronizar, sin duplicar formatos.
  // Match ESTABLE por el link de Meta (ad id — no cambia); portada/respaldo son
  // fallback (pueden cambiar al re-analizar/respaldar). Así la copia del cliente se
  // matchea a la del banco aunque la portada/URL haya cambiado → sí se refresca.
  const { data: destConcepts } = await database
    .from("despliegue_concepts").select("id, stage, format, name").eq("board_id", targetBoardId).eq("archived", false);
  const destConceptIds = (destConcepts || []).map((c) => c.id);
  // Índice MULTI-CLAVE del destino: cada variación destino registra TODAS sus
  // claves de identidad → así una entrante matchea aunque comparta solo una.
  const destByKey = new Map();
  if (destConceptIds.length) {
    const { data: destVars } = await database
      .from("despliegue_variations")
      .select("id, concept_id, file_url, drive_url, meta_ads_library_url, meta_ad_id, source_type")
      .in("concept_id", destConceptIds);
    for (const dv of destVars || []) for (const k of _varKeys(dv)) if (!destByKey.has(k)) destByKey.set(k, dv);
  }

  const toInsert = [];
  const toRefresh = [];
  const batchKeys = new Set();   // dedup DENTRO del lote entrante (banco con la misma copia 2 veces → 1)
  for (const v of variationsToCopy) {
    const keys = _varKeys(v);
    let dv = null;
    for (const k of keys) if (destByKey.has(k)) { dv = destByKey.get(k); break; }
    if (dv) { toRefresh.push({ dest: dv, src: v }); continue; }
    if (keys.length && keys.some((k) => batchKeys.has(k))) continue;   // ya vamos a insertar una igual → saltar
    keys.forEach((k) => batchKeys.add(k));
    toInsert.push(v);
  }

  // ── Concepto destino: reusar el de misma (stage,format,name) o crear — PRIMERO,
  //    para poder REUBICAR ahí las refs que estén en el concepto equivocado ──
  const nk = (s) => (s || "").trim().toLowerCase();
  let targetConcept = (destConcepts || []).find((c) => c.stage === concept.stage && c.format === concept.format && nk(c.name) === nk(concept.name));
  if (targetConcept) {
    await database.from("despliegue_concepts").update({ description: concept.description || null, execution: concept.execution || null }).eq("id", targetConcept.id);
  } else {
    const { data: bucketSiblings } = await database
      .from("despliegue_concepts").select("order_index")
      .eq("board_id", targetBoardId).eq("stage", concept.stage).eq("format", concept.format).eq("archived", false)
      .order("order_index", { ascending: false }).limit(1);
    const nextIdx = bucketSiblings?.[0]?.order_index != null ? bucketSiblings[0].order_index + 1 : 0;
    const { data: newConcept, error: ne } = await database
      .from("despliegue_concepts")
      .insert({
        board_id: targetBoardId, stage: concept.stage, format: concept.format, name: concept.name,
        description: concept.description || null, execution: concept.execution || null,
        weekly_target: concept.weekly_target || 3, order_index: nextIdx, bank_hidden: true,
      })
      .select().single();
    if (ne) throw ne;
    targetConcept = newConcept;
  }

  // Refrescar en sitio las que ya existían → trae notas/guion/video/labels Y las
  // REUBICA al concepto correcto (arregla refs metidas en el funnel equivocado).
  let refreshed = 0, relocated = 0;
  for (const { dest, src } of toRefresh) {
    // GUARDA: un creativo PROPIO del cliente (source_type="produced") que comparte
    // clave de identidad con una ref del banco NO se toca. Sin esto se reubicaría al
    // funnel del banco (p.ej. un VSL de BOFU arrastrado a un concepto de TOFU) y sus
    // etiquetas se borrarían. Solo se refrescan/reubican REFERENTES del banco
    // (source_type="reference" o null/legacy). Mismo criterio que dedupeBoardReferences.
    if (dest.source_type === "produced") continue;
    const moving = dest.concept_id && dest.concept_id !== targetConcept.id;
    // No pisar etiquetas existentes con {} vacío: solo escribir bank_labels cuando el
    // banco realmente trae contenido; si no, conservar las del destino.
    const srcHasLabels = src.bank_labels && Object.keys(src.bank_labels).length > 0;
    const { error } = await database.from("despliegue_variations").update({
      concept_id: targetConcept.id,   // reubicar
      notes: src.notes || null,
      transcript: src.transcript || null,
      drive_url: src.drive_url || null,
      // NO degradar: si el cliente ya tiene una portada buena y el banco trae una
      // vencida, gana la del cliente. Antes era `src || dest` y bastaba con que el
      // banco tuviera cualquier URL para pisar trabajo ya hecho a mano.
      file_url: bestCover(src.file_url, dest.file_url),
      ...(srcHasLabels ? { bank_labels: src.bank_labels } : {}),
      name: src.name || null,
      updated_at: new Date().toISOString(),
    }).eq("id", dest.id);
    if (!error) { refreshed++; if (moving) relocated++; }
  }

  if (toInsert.length > 0) {
    const payload = toInsert.map((v) => ({
      concept_id: targetConcept.id,
      label: v.label,
      name: v.name || null,
      state: "pending",
      file_url: v.file_url || null,
      drive_url: v.drive_url || null,
      meta_ads_library_url: v.meta_ads_library_url || null,
      bank_labels: v.bank_labels || {},
      transcript: v.transcript || null,
      notes: v.notes || null,   // ANTES se dropeaba — por eso el cliente no veía notas
    }));
    const { error: vErr } = await database.from("despliegue_variations").insert(payload);
    if (vErr) throw vErr;
  }

  return { newConceptId: targetConcept.id, variationsCopied: toInsert.length, refreshed, relocated };
}

// Limpia duplicados de REFERENTES dentro de un despliegue (board): si el mismo
// creativo quedó cargado 2+ veces (mismo id de anuncio / archivo de video /
// portada / URL de Meta), conserva la copia MÁS COMPLETA y borra el resto. NO
// toca los "Anuncios creados" del cliente (source_type='produced'), solo referentes.
// Se corre al final de un import para dejar el despliegue prolijo. Devuelve { deleted }.
export async function dedupeBoardReferences(boardId) {
  if (!boardId) return { deleted: 0 };
  const { data: concepts } = await database
    .from("despliegue_concepts").select("id").eq("board_id", boardId).eq("archived", false);
  const ids = (concepts || []).map((c) => c.id);
  if (!ids.length) return { deleted: 0 };
  const { data: vars } = await database
    .from("despliegue_variations")
    .select("id, concept_id, file_url, drive_url, meta_ads_library_url, meta_ad_id, transcript, notes, source_type, created_at")
    .in("concept_id", ids);
  const refs = (vars || []).filter((v) => (v.source_type || "reference") === "reference");
  if (refs.length < 2) return { deleted: 0 };
  const score = (v) => (v.drive_url ? 4 : 0) + (v.transcript && v.transcript.trim() ? 3 : 0) + (v.file_url ? 2 : 0) + (v.notes && v.notes.trim() ? 1 : 0);
  const dropIds = [];
  for (const g of _groupDupes(refs)) {
    const sorted = [...g].sort((a, b) => score(b) - score(a) || ((a.created_at || "") < (b.created_at || "") ? -1 : 1));
    dropIds.push(...sorted.slice(1).map((v) => v.id));   // conserva el mejor, borra el resto
  }
  if (!dropIds.length) return { deleted: 0 };
  const r = await deleteVariationsBulk(dropIds);
  return { deleted: r?.count ?? dropIds.length };
}

// ✅ Completa guion + notas de TODO el banco, barato y sin re-analizar todo:
//  • Guion: a cada VIDEO sin transcript (con respaldo descargable) → solo Whisper.
//    Si Whisper vuelve vacío = solo música → se marca (bank_labels._audio="none") y no se reintenta.
//  • Notas: a cada ref sin notas que ya tenga guion (o portada) → 1 llamada Claude mínima.
// Devuelve el desglose. onProgress(msg).
export async function completeBankRefs({ pipelineType = "ads", onProgress = null } = {}) {
  const vars = await listBankVariations(pipelineType);
  const hasT = (v) => !!(v.transcript && v.transcript.trim());
  const hasN = (v) => !!(v.notes && v.notes.trim());
  const noAudio = (v) => (v.bank_labels || {})._audio === "none";
  const videoUrlOf = variationVideoUrl;   // compartido con el generador de guiones del pipeline

  // 1) GUION — videos sin transcript, con video descargable, no marcados sin-audio.
  const needT = vars.filter((v) => v.concept_format === "video" && !hasT(v) && !noAudio(v) && videoUrlOf(v));
  let transcribed = 0, noAudioCount = 0, tFailed = 0, i = 0;
  for (const v of needT) {
    onProgress?.(`Transcribiendo ${++i}/${needT.length}…`);
    try {
      const resp = await fetch("/api/classify-ad", { method: "POST", headers: await buildApiHeaders(), body: JSON.stringify({ mode: "transcript_only", videoUrl: videoUrlOf(v) }) });
      const data = await resp.json();
      if (data.ok && data.transcript && data.transcript.trim()) {
        await updateVariation(v.id, { transcript: data.transcript.trim() }); v.transcript = data.transcript.trim(); transcribed++;
      } else if (data.ok && data.noAudio) {
        await updateVariation(v.id, { bank_labels: { ...(v.bank_labels || {}), _audio: "none" } }); noAudioCount++;
      } else tFailed++;
    } catch { tFailed++; }
  }

  // 2) NOTAS — refs sin notas que ya tengan guion (o portada). Se recalcula DESPUÉS
  // de transcribir, así los recién-transcritos también reciben notas.
  const needN = vars.filter((v) => !hasN(v) && (hasT(v) || v.file_url));
  let notesAdded = 0, nFailed = 0, j = 0;
  for (const v of needN) {
    onProgress?.(`Notas ${++j}/${needN.length}…`);
    try {
      const resp = await fetch("/api/classify-ad", { method: "POST", headers: await buildApiHeaders(), body: JSON.stringify({ mode: "notes_only", transcript: v.transcript || "", coverUrl: v.file_url || null }) });
      const data = await resp.json();
      if (data.ok && data.notes) { await updateVariation(v.id, { notes: data.notes }); notesAdded++; } else nFailed++;
    } catch { nFailed++; }
  }

  return { transcribed, noAudio: noAudioCount, notesAdded, tFailed, nFailed, checkedT: needT.length, checkedN: needN.length };
}

// 🔄 Sincroniza el despliegue de una empresa DESDE el banco: por cada formato de la
// empresa que exista en el banco (match por nombre+stage+format), re-corre el import
// idempotente → refresca notas/guion/video/etiquetas de las refs existentes y agrega
// las nuevas, SIN duplicar formatos. Devuelve { synced, refreshed, added, total }.
// "Riqueza" de un concepto = qué tan organizado está. Sirve para elegir, entre
// duplicados con el mismo nombre en varios boards, el CANÓNICO (el que el usuario
// realmente organizó). Prioridad fuerte: tiene execution ("cómo se hace"); luego
// description; luego cantidad de referencias.
function conceptRichness(c) {
  return ((c.execution && String(c.execution).trim()) ? 100000 : 0)
    + ((c.description && String(c.description).trim()) ? 1000 : 0)
    + (c.variations_count || 0);
}

export async function syncBoardFromBank(companyId, pipelineType = "ads", onProgress = null) {
  const board = await getOrCreateBoard(companyId, pipelineType);
  const companyConcepts = await listConcepts(board.id);
  const bankConcepts = (await listBankConcepts()).filter((c) => (c.pipeline_type || "ads") === pipelineType);
  const nk = (s) => (s || "").trim().toLowerCase();
  // Resolución DETERMINISTA: entre conceptos con el mismo (stage|format|nombre) en
  // distintos boards, quedarse con el MÁS RICO (organizado), y EXCLUIR el board de la
  // propia empresa (no sincronizar desde sí misma → evita traer su versión vacía).
  const bankBy = new Map();
  for (const bc of bankConcepts) {
    if (bc.company_id === companyId) continue;
    const key = `${bc.stage}|${bc.format}|${nk(bc.name)}`;
    const prev = bankBy.get(key);
    if (!prev || conceptRichness(bc) > conceptRichness(prev)) bankBy.set(key, bc);
  }

  // FILTRO DE NICHO derivado de lo que la empresa YA tiene: el sync trae SOLO
  // referencias de esos nichos → nunca vuelve a meter el "flood" de otros nichos.
  // Seguro: nunca agrega un nicho que la empresa no tuviera. Si no tiene nichos
  // (empresa vacía), no filtra (comportamiento viejo).
  const nicheSet = new Set();
  const compIds = companyConcepts.map((c) => c.id);
  if (compIds.length) {
    const { data: cv } = await database.from("despliegue_variations").select("bank_labels").in("concept_id", compIds);
    for (const v of cv || []) for (const cat of ["nicho", "subnicho"]) for (const val of (v.bank_labels?.[cat] || [])) { if (val) nicheSet.add(val); }
  }
  const labelFilter = nicheSet.size ? { nicho: [...nicheSet] } : null;

  let synced = 0, refreshed = 0, added = 0, relocated = 0, i = 0;
  const total = companyConcepts.length;
  const done = new Set();
  for (const cc of companyConcepts) {
    onProgress?.(++i, total, cc.name);
    const bc = bankBy.get(`${cc.stage}|${cc.format}|${nk(cc.name)}`);
    if (!bc || done.has(bc.id)) continue;   // no está en el banco, o ya sincronizado
    done.add(bc.id);
    try {
      const r = await importConceptToBoard({ sourceConceptId: bc.id, targetBoardId: board.id, labelFilter });
      synced++; refreshed += r.refreshed || 0; added += r.variationsCopied || 0; relocated += r.relocated || 0;
    } catch { /* sigue con los demás */ }
  }
  return { synced, refreshed, added, relocated, total, matched: [...bankBy.keys()].length, niches: [...nicheSet] };
}

// Normaliza un nombre de concepto quitando el sufijo de etapa "(Tofu)/(Mofu)/(Bofu)"
// para detectar duplicados: "Comparativo" y "Comparativo (Bofu)" → misma clave.
function stripStageSuffix(s) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s*\((tofu|mofu|bofu)\)\s*/g, " ").replace(/\s+/g, " ").trim();
}

// Detecta CONCEPTOS DUPLICADOS dentro de un board: mismo (stage, format, nombre sin
// sufijo de etapa). Pasa cuando el usuario renombró (agregó "(Tofu)") y quedó el viejo
// sin sufijo. Devuelve grupos { keeperId, keeperName, stage, format, keeperRefs, losers[] }
// donde keeper = el MÁS COMPLETO (execution + transcript + refs). Solo grupos con 2+.
export async function findDuplicateConcepts(boardId) {
  if (!boardId) return [];
  const { data: concepts } = await database
    .from("despliegue_concepts").select("id, name, stage, format, description, execution")
    .eq("board_id", boardId).eq("archived", false);
  if (!concepts?.length) return [];
  const ids = concepts.map((c) => c.id);
  const { data: vars } = await database.from("despliegue_variations").select("concept_id, transcript").in("concept_id", ids);
  const refCount = new Map(), transCount = new Map();
  for (const v of vars || []) {
    refCount.set(v.concept_id, (refCount.get(v.concept_id) || 0) + 1);
    if (v.transcript && v.transcript.trim()) transCount.set(v.concept_id, (transCount.get(v.concept_id) || 0) + 1);
  }
  const score = (c) => ((c.execution && c.execution.trim()) ? 100000 : 0) + ((c.description && c.description.trim()) ? 1000 : 0) + (transCount.get(c.id) || 0) * 10 + (refCount.get(c.id) || 0);
  const groups = new Map();
  for (const c of concepts) {
    const key = `${c.stage}|${c.format}|${stripStageSuffix(c.name)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  const out = [];
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const sorted = [...g].sort((a, b) => score(b) - score(a));
    const keeper = sorted[0];
    out.push({
      keeperId: keeper.id, keeperName: keeper.name, stage: keeper.stage, format: keeper.format,
      keeperRefs: refCount.get(keeper.id) || 0,
      losers: sorted.slice(1).map((l) => ({ id: l.id, name: l.name, refs: refCount.get(l.id) || 0 })),
    });
  }
  return out.sort((a, b) => b.losers.length - a.losers.length || a.keeperName.localeCompare(b.keeperName));
}

// Limpia los grupos de duplicados. Dos modos:
//  • moveRefs=false (BORRAR, default): archiva los conceptos viejos CON sus refs
//    (desaparecen del despliegue). Reversible. Simple, sin mover nada.
//  • moveRefs=true (FUSIONAR): mueve las refs de los viejos al keeper y luego los
//    archiva (no pierde refs) + dedup del keeper.
// `groups` = subconjunto de findDuplicateConcepts que el usuario confirmó.
export async function mergeDuplicateConcepts(groups, boardId, { moveRefs = false } = {}) {
  let merged = 0, refsMoved = 0, archived = 0;
  for (const g of groups || []) {
    const loserIds = (g.losers || []).map((l) => l.id).filter(Boolean);
    if (!loserIds.length || !g.keeperId) continue;
    if (moveRefs) {
      const { data: moved, error: mErr } = await database
        .from("despliegue_variations").update({ concept_id: g.keeperId }).in("concept_id", loserIds).select("id");
      if (mErr) throw mErr;
      refsMoved += moved?.length || 0;
    }
    const { error: aErr } = await database.from("despliegue_concepts").update({ archived: true }).in("id", loserIds);
    if (aErr) throw aErr;
    archived += loserIds.length;
    merged++;
  }
  // Solo tiene sentido deduplicar refs si las movimos al keeper.
  let dupRemoved = 0;
  if (moveRefs && boardId) { try { const r = await dedupeBoardReferences(boardId); dupRemoved = r.deleted || 0; } catch { /* no bloquea */ } }
  return { merged, refsMoved, archived, dupRemoved };
}

// Excluye conceptos del banco (NO los archiva en su despliegue origen).
// Marca bank_hidden=true. Reversible vía restoreConceptsToBank().
export async function excludeConceptsFromBank(conceptIds) {
  if (!conceptIds?.length) return { count: 0 };
  const { error } = await database
    .from("despliegue_concepts")
    .update({ bank_hidden: true })
    .in("id", conceptIds);
  if (error) throw error;
  return { count: conceptIds.length };
}

// Borra DEFINITIVAMENTE un concepto del banco Y de su despliegue origen.
// A diferencia de excludeConceptsFromBank (soft, bank_hidden=true), esto elimina
// la fila de despliegue_concepts; sus despliegue_variations caen por
// ON DELETE CASCADE. Irreversible.
//
// Si el concepto pertenece a un concept_group_id, solo se borra ESTE miembro —
// los hermanos de otras empresas siguen vivos con su propio material.
export async function deleteConceptCompletely(conceptId) {
  if (!conceptId) return { count: 0 };
  // `.select()` devuelve las filas efectivamente borradas → si RLS o un FK lo
  // bloquean, count queda en 0 en vez de fallar en silencio.
  const { data, error } = await database
    .from("despliegue_concepts")
    .delete()
    .eq("id", conceptId)
    .select("id");
  if (error) throw error;
  return { count: (data || []).length };
}

// Actualiza campos editables de un concepto del banco (nombre, descripción,
// ejecución, formato, stage, bank_tags). Reusa el updateConcept del despliegue.
export async function updateBankConcept(conceptId, patch) {
  return updateConcept(conceptId, patch);
}

// Mueve un concepto entre pipelines (ads ↔ organic), o sea de Banco de creativos
// a Banco de contenido y viceversa. El pipeline vive en el BOARD, así que
// reubicamos el concepto al board del mismo dueño (empresa) del pipeline destino,
// creándolo si no existe. Cambia también en el despliegue de esa empresa.
export async function moveConceptToPipeline(conceptId, pipelineType) {
  const { data: concept, error: ce } = await database
    .from("despliegue_concepts")
    .select("id, board_id")
    .eq("id", conceptId)
    .maybeSingle();
  if (ce) throw ce;
  if (!concept) throw new Error("Concepto no encontrado");
  const { data: board, error: be } = await database
    .from("despliegue_boards")
    .select("company_id, pipeline_type")
    .eq("id", concept.board_id)
    .maybeSingle();
  if (be) throw be;
  if (!board) throw new Error("Board no encontrado");
  if (board.pipeline_type === pipelineType) return concept; // ya está ahí
  const target = await getOrCreateBoard(board.company_id, pipelineType);
  return updateConcept(conceptId, { board_id: target.id });
}

// Crea un concepto NUEVO directo en el banco (no viene de una empresa cliente).
// Vive en el board centinela "Banco de referencias" del pipeline indicado
// (ads | organic). Devuelve el concepto creado.
export async function createBankConcept({ pipelineType = "ads", stage, format, name, description = null, execution = null, bank_tags = [] }) {
  if (!name?.trim()) throw new Error("El nombre es requerido");
  const board = await getOrCreateBoard(BANK_REFS_COMPANY_ID, pipelineType);
  // order_index siguiente dentro del bucket (stage+format) del board.
  const { data: siblings } = await database
    .from("despliegue_concepts")
    .select("order_index")
    .eq("board_id", board.id)
    .eq("stage", stage)
    .eq("format", format)
    .eq("archived", false)
    .order("order_index", { ascending: false })
    .limit(1);
  const nextIdx = siblings?.[0]?.order_index != null ? siblings[0].order_index + 1 : 0;

  const concept = await createConcept({
    board_id: board.id,
    stage,
    format,
    name: name.trim(),
    description: description?.trim() || null,
    execution: execution?.trim() || null,
    order_index: nextIdx,
  });
  if (bank_tags?.length) {
    return updateConcept(concept.id, { bank_tags });
  }
  return concept;
}

// Agrega una referencia (variation) a un concepto existente del banco. Reusa
// createVariation del despliegue. `label` es obligatorio en la tabla.
export async function createBankVariation({ conceptId, label, name = null, state = "produced", file_url = null, drive_url = null, meta_ads_library_url = null, notes = null, bank_labels = null, transcript = null }) {
  if (!conceptId) throw new Error("conceptId es requerido");
  return createVariation({
    concept_id: conceptId,
    label: (label || "Ref").trim(),
    name: name?.trim() || null,
    state,
    file_url: file_url || null,
    drive_url: drive_url?.trim() || null,
    meta_ads_library_url: meta_ads_library_url?.trim() || null,
    notes: notes?.trim() || null,
    transcript: transcript?.trim() || null,
    ...(bank_labels && Object.keys(bank_labels).length ? { bank_labels } : {}),
  });
}

// Devuelve conceptos al banco (para revertir una exclusión).
export async function restoreConceptsToBank(conceptIds) {
  if (!conceptIds?.length) return { count: 0 };
  const { error } = await database
    .from("despliegue_concepts")
    .update({ bank_hidden: false })
    .in("id", conceptIds);
  if (error) throw error;
  return { count: conceptIds.length };
}

// Combina varios conceptos. Tiene 2 modos:
//
// 1. **Same-company**: los conceptos seleccionados son de la misma empresa.
//    Mueve todas las variations al target (cambia concept_id) y oculta los
//    sources del banco. El target absorbe todo.
//
// 2. **Cross-company**: los seleccionados son de empresas distintas.
//    NO mueve variations — cada empresa mantiene sus refs originales en
//    su propio despliegue. En su lugar les asigna el mismo `concept_group_id`,
//    lo que permite que el render del despliegue (listVariationsForBoard)
//    incluya variations de los hermanos del grupo, ordenadas con own-first.
//    El target queda visible en el banco; los demás se ocultan (bank_hidden).
//    Si alguno ya tenía group_id, lo reusa. Si hay múltiples groups en la
//    selección, los fusiona en uno (todos los miembros pasan al group elegido).
export async function mergeConceptsInBank({ targetConceptId, sourceConceptIds }) {
  if (!targetConceptId) throw new Error("targetConceptId es requerido");
  const sources = (sourceConceptIds || []).filter((id) => id && id !== targetConceptId);
  if (sources.length === 0) return { variationsMoved: 0, conceptsHidden: 0, grouped: false };

  const allIds = [targetConceptId, ...sources];

  // Resolver empresas y group_ids preexistentes en una sola query.
  const { data: rows, error: rErr } = await database
    .from("despliegue_concepts")
    .select("id, board_id, concept_group_id")
    .in("id", allIds);
  if (rErr) throw rErr;

  const boardIds = [...new Set((rows || []).map((r) => r.board_id))];
  const { data: boards, error: bErr } = await database
    .from("despliegue_boards")
    .select("id, company_id")
    .in("id", boardIds);
  if (bErr) throw bErr;

  const boardCompany = new Map((boards || []).map((b) => [b.id, b.company_id]));
  const companies = new Set((rows || []).map((r) => boardCompany.get(r.board_id)).filter(Boolean));
  const isCrossCompany = companies.size > 1;

  if (!isCrossCompany) {
    // ===== Same-company: flow original =====
    const { data: moved, error: mErr } = await database
      .from("despliegue_variations")
      .update({ concept_id: targetConceptId })
      .in("concept_id", sources)
      .select("id");
    if (mErr) throw mErr;

    const { error: hErr } = await database
      .from("despliegue_concepts")
      .update({ bank_hidden: true })
      .in("id", sources);
    if (hErr) throw hErr;

    return { variationsMoved: moved?.length || 0, conceptsHidden: sources.length, grouped: false };
  }

  // ===== Cross-company: agrupa, oculta siblings del banco =====
  // En el banco solo queda visible el `targetConceptId` como canonical del grupo.
  // Los siblings se ocultan (bank_hidden=true) pero siguen vivos en sus despliegues.
  // Cuando alguien abra el canonical, el detail drawer muestra refs de todos los
  // miembros del grupo. Cuando lo importen, se copian todas las refs deduped.
  const existingGroupIds = [...new Set(
    (rows || []).map((r) => r.concept_group_id).filter(Boolean)
  )];

  // Elegir group_id final: el primer existente, o uno nuevo.
  let groupId;
  if (existingGroupIds.length > 0) {
    groupId = existingGroupIds[0];
  } else {
    groupId = (typeof crypto !== "undefined" && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  // Si hay múltiples groups preexistentes, fusionarlos en el elegido.
  if (existingGroupIds.length > 1) {
    const others = existingGroupIds.filter((g) => g !== groupId);
    const { error: gmErr } = await database
      .from("despliegue_concepts")
      .update({ concept_group_id: groupId })
      .in("concept_group_id", others);
    if (gmErr) throw gmErr;
  }

  // Asignar group_id a TODOS los seleccionados.
  const { error: gErr } = await database
    .from("despliegue_concepts")
    .update({ concept_group_id: groupId })
    .in("id", allIds);
  if (gErr) throw gErr;

  // Ocultar sources del banco — solo target queda visible como canonical.
  const { error: hErr } = await database
    .from("despliegue_concepts")
    .update({ bank_hidden: true })
    .in("id", sources);
  if (hErr) throw hErr;

  // El target se asegura visible (por si vino oculto de un merge previo).
  const { error: vErr } = await database
    .from("despliegue_concepts")
    .update({ bank_hidden: false })
    .eq("id", targetConceptId);
  if (vErr) throw vErr;

  return {
    variationsMoved: 0,
    conceptsHidden: sources.length,
    grouped: true,
    groupId,
    membersLinked: allIds.length,
  };
}

// ───── Acciones en lote sobre referencias (variations) ────────────────────

// Borra varias referencias de una. Devuelve cuántas se borraron (0 = bloqueado).
export async function deleteVariationsBulk(ids) {
  if (!ids?.length) return { count: 0 };
  const { data, error } = await database
    .from("despliegue_variations")
    .delete()
    .in("id", ids)
    .select("id");
  if (error) throw error;
  return { count: (data || []).length };
}

// Mueve varias referencias a otro concepto (cambia concept_id de todas).
export async function moveVariationsToConcept({ variationIds, targetConceptId }) {
  if (!variationIds?.length || !targetConceptId) return { count: 0 };
  const { data, error } = await database
    .from("despliegue_variations")
    .update({ concept_id: targetConceptId, updated_at: new Date().toISOString() })
    .in("id", variationIds)
    .select("id");
  if (error) throw error;
  return { count: (data || []).length };
}

// Agrega tags de nicho a varias referencias (unión con los que ya tengan).
// Merge por fila porque Postgres no hace array-union en un solo UPDATE plano.
export async function addTagsToVariations(variationIds, tags) {
  const clean = (tags || []).map((t) => (t || "").trim().replace(/\s+/g, " ")).filter(Boolean);
  if (!variationIds?.length || !clean.length) return { count: 0 };
  const { data: rows, error } = await database
    .from("despliegue_variations")
    .select("id, bank_tags")
    .in("id", variationIds);
  if (error) throw error;
  await Promise.all((rows || []).map((r) => {
    const merged = Array.from(new Set([...(r.bank_tags || []), ...clean]));
    return database
      .from("despliegue_variations")
      .update({ bank_tags: merged, updated_at: new Date().toISOString() })
      .eq("id", r.id);
  }));
  return { count: (rows || []).length };
}

// 🔖 Re-clasifica SOLO las etiquetas (marca/nicho/subnicho/ángulo/formato) de
// referencias del BANCO que YA tienen transcripción guardada — SIN re-bajar ni
// re-transcribir el video (barato: 1 llamada de texto por ref, con el system
// prompt cacheado). Espeja reclassifyLabelsBulk de la bandeja. Detalle crítico:
// manda SOLO el transcript (NO coverUrl) — las portadas de Meta (fbcdn) suelen
// estar EXPIRADAS y classify-ad se las pasaría a Claude como URL → Claude falla
// al bajarla → 500. Preserva la marca ya detectada (forcedMarca) y el sub-formato
// pre-asignado; escribe únicamente bank_labels. Devuelve
// { updated, skipped, failed, total, sampleReason }.
export async function reclassifyBankLabelsBulk(variations, { concurrency = 4, onProgress = null } = {}) {
  const labels = await buildKnownLabels();
  const formats = await buildKnownFormats();
  const total = variations.length;
  let done = 0, updated = 0, skipped = 0, failed = 0;
  let sampleReason = null; // primera razón (para diagnóstico en la UI)
  const queue = [...variations];
  const prog = () => onProgress?.(`Reorganizando etiquetas ${done}/${total}…`);

  async function worker() {
    while (queue.length) {
      const v = queue.shift();
      const transcript = (typeof v.transcript === "string" && v.transcript.trim()) ? v.transcript : null;
      if (!transcript) {
        skipped++; if (!sampleReason) sampleReason = "sin transcripción guardada";
        done++; prog(); continue;
      }
      // forcedMarca mantiene la marca estable (solo se afina nicho/ángulo/formato).
      const forcedMarca = v.bank_labels?.marca?.[0] || null;
      // Solo el transcript: NO mandamos la portada (fbcdn expira → 500 en Claude).
      const body = { knownFormats: formats, knownLabels: labels, forcedMarca, transcript };
      try {
        const resp = await fetch("/api/classify-ad", {
          method: "POST", headers: await buildApiHeaders(), body: JSON.stringify(body),
        });
        const data = await resp.json().catch(() => ({}));
        if (resp.ok && data?.suggested_labels) {
          // Preservar el sub-formato pre-asignado, igual que writeAiResult/reclassifyLabelsBulk.
          const pre = v.bank_labels || {};
          const merged = { ...data.suggested_labels };
          if (Array.isArray(pre.formato) && pre.formato.length) merged.formato = pre.formato;
          await updateVariation(v.id, { bank_labels: merged });
          updated++;
        } else if (data?.needsFile || data?.ok === false) {
          // No es un error duro: no hay material re-clasificable barato. Requiere re-analizar.
          skipped++;
          if (!sampleReason) sampleReason = data.reason || "sin material re-clasificable";
        } else {
          failed++;
          if (!sampleReason) sampleReason = data?.error || `HTTP ${resp.status}`;
        }
      } catch (e) {
        logger.error("reclassifyBankLabelsBulk falló", e);
        failed++;
        if (!sampleReason) sampleReason = e?.message || String(e);
      }
      done++; prog();
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker));
  return { updated, skipped, failed, total, sampleReason };
}

// 🇪🇸 Traduce a ESPAÑOL los guiones (transcript) de referencias del banco que
// hayan quedado en otro idioma (los imports viejos de Meta guardaban guiones en
// inglés). Por cada variación con transcript no vacío pide a classify-ad
// (mode:"translate_es") el guion en español — si ya está en español vuelve
// idéntico y NO se reescribe. Barato: 1 llamada de texto por ref, sin re-bajar el
// video. Espeja el pool concurrente de reclassifyBankLabelsBulk. Devuelve
// { translated, unchanged, skipped, failed, total }.
export async function translateBankTranscriptsBulk(variations, { concurrency = 4, onProgress = null } = {}) {
  const total = (variations || []).length;
  let done = 0, translated = 0, unchanged = 0, skipped = 0, failed = 0;
  const queue = [...(variations || [])];
  const prog = () => onProgress?.(`Traduciendo guiones ${done}/${total}…`);

  async function worker() {
    while (queue.length) {
      const v = queue.shift();
      const original = (typeof v.transcript === "string" && v.transcript.trim()) ? v.transcript : null;
      if (!original) { skipped++; done++; prog(); continue; }   // sin guion → nada que traducir
      try {
        const resp = await fetch("/api/classify-ad", {
          method: "POST", headers: await buildApiHeaders(),
          body: JSON.stringify({ mode: "translate_es", text: original }),
        });
        const data = await resp.json().catch(() => ({}));
        const returned = (resp.ok && typeof data?.text === "string") ? data.text.trim() : null;
        if (returned == null) {
          failed++;
        } else if (returned && returned !== original.trim()) {
          // Cambió respecto al original → estaba en otro idioma: se persiste.
          await updateVariation(v.id, { transcript: returned });
          v.transcript = returned;
          translated++;
        } else {
          // Volvió idéntico (o vacío) → ya estaba en español: no se reescribe.
          unchanged++;
        }
      } catch (e) {
        logger.error("translateBankTranscriptsBulk falló", e);
        failed++;
      }
      done++; prog();
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker));
  return { translated, unchanged, skipped, failed, total };
}

// Heurística de portada "rota": no podemos hacer un HEAD a cada URL (caro), así que
// asumimos que una portada de fbcdn/fbsbx/facebook (o vacía) PUEDE haber expirado y
// es elegible para reparar; una alojada en Supabase Storage (database.co/storage) es
// PERMANENTE → nunca se toca.
// La regla vive en src/lib/coverUrl.js — esta era la versión correcta y ahora la
// comparten todos (el pipeline tenía una lista negra al revés que borraba portadas).
const coverLooksExpired = coverIsExpired;

const _repairAdId = (v) => {
  const m = (v.meta_ads_library_url || "").match(/[?&]id=(\d{5,})/);
  return String(v.meta_ad_id || (m ? m[1] : "") || "");
};

// ¿La URL del video de respaldo es LEGIBLE por canvas? Solo Supabase Storage manda
// CORS `*`; un link viejo de Google Drive no se puede reproducir ni leer → lo saltamos
// (evita colgarse 15s por cada uno esperando un video que nunca carga).
// (compartida — ver src/lib/coverUrl.js)

// 🖼️ Recupera portadas rotas del banco A PARTIR DEL VIDEO DE RESPALDO (100% en el
// navegador, sin Meta ni Apify). Muchas portadas guardaron URLs de fbcdn que EXPIRAN,
// pero el video sí quedó respaldado en Storage (drive_url). Sacamos un fotograma del
// video con <video>+<canvas> y lo re-subimos a Storage como portada permanente.
// Es la vía MÁS confiable: no depende de que el anuncio siga vivo en Meta ni de que
// aparezca en el scrape por marca. Solo aplica a videos en Storage (CORS legible).
// Nunca lanza. Devuelve { coversFixed, failed, total }.
export async function repairBankCoversFromVideo(variations, { onProgress = null } = {}) {
  const targets = (variations || []).filter(
    (v) => coverLooksExpired(v.file_url) && videoIsCanvasReadable(v.drive_url),
  );
  const total = targets.length;
  if (!total) return { coversFixed: 0, failed: 0, total: 0 };

  let coversFixed = 0, failed = 0, i = 0;
  for (const v of targets) {
    onProgress?.(`Regenerando portada ${++i}/${total} desde el video…`);
    try {
      const blob = await extractVideoCoverFromUrl(v.drive_url);
      if (!blob) { failed++; continue; }
      const storageUrl = await uploadCoverBlob(blob, { prefix: "bank-covers" });
      await updateVariation(v.id, { file_url: storageUrl });
      v.file_url = storageUrl;
      coversFixed++;
    } catch (e) { logger.error("repairBankCoversFromVideo falló", e); failed++; }
  }
  return { coversFixed, failed, total };
}

// 🖼️ Recupera las portadas de TODO el banco principal, sin tener que seleccionar
// conceptos a mano. `listBankVariations` ya deja fuera los archivados, los ocultos
// y los boards inactivos, así que el alcance sale gratis y es el correcto.
//
// Solo usa el video de respaldo: no toca Meta ni Apify, así que no cuesta plata ni
// depende de que el anuncio siga publicado. Lo que no tiene video recuperable se
// devuelve en `manual` para poder listarlo y resolverlo con el drag & drop.
export async function repairAllBankCovers({ pipelineType = "ads", onProgress = null } = {}) {
  onProgress?.("Buscando referencias del banco…");
  const all = await listBankVariations(pipelineType);
  const rotas = all.filter((v) => coverLooksExpired(v.file_url));
  const desdeVideo = rotas.filter((v) => videoIsCanvasReadable(v.drive_url));
  const manual = rotas.filter((v) => !videoIsCanvasReadable(v.drive_url));

  if (!desdeVideo.length) {
    return { coversFixed: 0, failed: 0, total: 0, manual: manual.length, manualList: manual, scanned: all.length };
  }
  const r = await repairBankCoversFromVideo(desdeVideo, { onProgress });
  return { ...r, manual: manual.length, manualList: manual, scanned: all.length };
}

// 🔗 Conecta las portadas entre el banco y los boards de los clientes.
//
// El mismo anuncio vive en varias filas: la del banco y una copia por cada
// cliente. Cuando arreglabas una portada en el banco, la copia del cliente se
// quedaba con la vieja hasta volver a importar el concepto a mano — por eso en el
// portal del cliente salían rotas portadas que en el banco ya estaban puestas.
//
// Esto recorre TODAS las variaciones (no solo el banco: el objetivo son
// justamente las copias de los clientes), agrupa por identidad del anuncio y
// rellena las que no tienen portada con la de una hermana que sí. Solo RELLENA:
// nunca pisa una portada que ya sirva.
export async function connectCoversAcrossBoards({ onProgress = null } = {}) {
  onProgress?.("Leyendo referentes…");
  const all = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await database
      .from("despliegue_variations")
      .select("id, file_url, drive_url, meta_ad_id, meta_ads_library_url")
      .range(from, from + 999);
    if (error) throw error;
    all.push(...(data || []));
    if (!data || data.length < 1000) break;
  }

  // Agrupar por clave de identidad (id de Meta o archivo de video). La portada
  // NO se usa como clave: sería circular, solo emparejaría las que ya coinciden.
  const groups = new Map();
  for (const v of all) {
    for (const k of identityKeys(v)) {
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(v);
    }
  }

  const fix = new Map();   // id → portada a escribir
  for (const rows of groups.values()) {
    if (rows.length < 2) continue;
    const donor = rows.find((r) => isOwnStorage(r.file_url)) || rows.find((r) => isUsableCover(r.file_url));
    if (!donor) continue;
    for (const r of rows) {
      if (r.id === donor.id || isUsableCover(r.file_url) || fix.has(r.id)) continue;
      fix.set(r.id, donor.file_url);
    }
  }

  const total = fix.size;
  if (!total) return { connected: 0, total: 0, scanned: all.length };

  // Se agrupa por portada para actualizar en lote (una query por portada, no una
  // por fila): con miles de filas la diferencia es de minutos a segundos.
  const byCover = new Map();
  for (const [id, cover] of fix) {
    if (!byCover.has(cover)) byCover.set(cover, []);
    byCover.get(cover).push(id);
  }

  let connected = 0, done = 0;
  for (const [cover, ids] of byCover) {
    for (let i = 0; i < ids.length; i += 100) {
      const page = ids.slice(i, i + 100);
      const { error } = await database
        .from("despliegue_variations")
        .update({ file_url: cover, updated_at: new Date().toISOString() })
        .in("id", page);
      if (!error) connected += page.length;
      done += page.length;
      onProgress?.(`Conectando portadas ${done}/${total}…`);
    }
  }
  return { connected, total, scanned: all.length };
}

// 🔧 Repara portadas + videos ROTOS de referencias del banco (MEJOR ESFUERZO). Los
// creativos importados de Meta guardaron URLs de fbcdn que EXPIRAN → portadas rotas
// (file_url muerto) y videos irreproducibles (drive_url null). Re-scrapea el anuncio
// por su ad_id (via Apify, agrupando por marca) y, SOLO si sigue vivo en Meta, arregla
// lo que esté roto:
//   • video faltante (drive_url null) → lo respalda con driveBackupFromUrl (misma vía
//     que backupBankVariationsToDrive: /api/drive-backup baja el mp4 y devuelve un link).
//   • portada con pinta de expirada (coverLooksExpired) → baja la imagen re-scrapeada y
//     la re-sube a Storage (permanente) con uploadCoverBlob.
// Nunca lanza: cada fallo se cuenta, no se tira. Devuelve
// { coversFixed, videosFixed, failed, notLive, total }.
export async function repairBankMediaBulk(variations, { onProgress = null } = {}) {
  // Solo variaciones re-buscables (con ad_id) que tengan ALGO roto (video o portada).
  const targets = (variations || []).filter((v) => {
    if (!(v.meta_ad_id || v.meta_ads_library_url)) return false;
    return !v.drive_url || coverLooksExpired(v.file_url);
  });
  const total = targets.length;
  if (!total) return { coversFixed: 0, videosFixed: 0, failed: 0, notLive: 0, total: 0 };

  // Marcas a scrapear = las de las variaciones. Una corrida de Apify por marca cubre
  // todos sus anuncios → mapa ad_id → resultado (con video_url / image_url).
  const brandSet = new Map();
  const push = (b) => { const s = (b || "").trim(); if (s && s.length >= 2 && !brandSet.has(s.toLowerCase())) brandSet.set(s.toLowerCase(), s); };
  for (const v of targets) push(v.bank_labels?.marca?.[0]);
  const brands = [...brandSet.values()];
  if (!brands.length) return { coversFixed: 0, videosFixed: 0, failed: total, notLive: 0, total, reason: "Las variaciones no tienen marca. Agregala a mano." };

  const map = new Map();   // ad_id → resultado del scrape (video_url / image_url)
  let bi = 0;
  for (const b of brands) {
    onProgress?.(`Buscando ${b} en Meta (${++bi}/${brands.length})…`);
    try {
      const data = await apifyScrapeBrand(b, { count: 300 });
      for (const r of (data?.results || [])) {
        if (!r.ad_id) continue;
        map.set(String(r.ad_id), r);
      }
    } catch (e) { logger.error("repairBankMediaBulk apify falló", e); }
  }

  let coversFixed = 0, videosFixed = 0, failed = 0, notLive = 0, i = 0;
  for (const v of targets) {
    onProgress?.(`Reparando ${++i}/${total}…`);
    const adId = _repairAdId(v);
    const r = adId ? map.get(adId) : null;
    if (!r) { notLive++; continue; }   // el anuncio ya no está en Meta → no se puede recuperar

    // Video roto (drive_url null) → respaldar el video re-scrapeado.
    if (!v.drive_url && r.video_url) {
      try {
        const { url: link } = await driveBackupFromUrl(r.video_url, {
          marca: v.bank_labels?.marca?.[0] || null,
          format: v.concept_name || v.bank_labels?.formato?.[0] || null,
          stage: v.concept_stage || null,
        });
        if (link) { await updateVariation(v.id, { drive_url: link }); v.drive_url = link; videosFixed++; }
        else failed++;
      } catch (e) { logger.error("repairBankMediaBulk video falló", e); failed++; }
    }

    // Portada rota (fbcdn expirada / faltante) → bajar la imagen re-scrapeada y
    // re-hostearla en Storage (permanente) con uploadCoverBlob.
    if (coverLooksExpired(v.file_url) && r.image_url) {
      try {
        const resp = await fetch(r.image_url);
        if (resp.ok) {
          const blob = await resp.blob();
          const storageUrl = await uploadCoverBlob(blob, { prefix: "bank-covers" });
          await updateVariation(v.id, { file_url: storageUrl }); v.file_url = storageUrl; coversFixed++;
        } else failed++;
      } catch (e) { logger.error("repairBankMediaBulk portada falló", e); failed++; }
    }
  }
  return { coversFixed, videosFixed, failed, notLive, total, brands: brands.length };
}

// Mueve una variation a otro concept (cambia concept_id).
// Si los conceptos están en boards distintos, la variation pasa a aparecer
// en el despliegue del board destino. La UI lo advierte cuando cross-empresa.
export async function moveVariationToConcept({ variationId, targetConceptId }) {
  if (!variationId || !targetConceptId) {
    throw new Error("variationId y targetConceptId son requeridos");
  }
  const { error } = await database
    .from("despliegue_variations")
    .update({ concept_id: targetConceptId, updated_at: new Date().toISOString() })
    .eq("id", variationId);
  if (error) throw error;
}

// Mueve un referente a otro concepto EN EL BOARD DEL CLIENTE y propaga el mismo
// movimiento al BANCO GENERAL (bank_refs), así las re-importaciones no lo revierten
// (el import reubica por (stage, format, name) del concepto fuente del banco).
// targetConcept = { id, stage, format, name } del board del cliente.
export async function moveReferenteEverywhere({ variation, targetConcept }) {
  if (!variation?.id || !targetConcept?.id) throw new Error("variation y targetConcept son requeridos");
  // 1. Mover la fila del cliente.
  await moveVariationToConcept({ variationId: variation.id, targetConceptId: targetConcept.id });

  // 2. Buscar la fila gemela en el banco general (por id de anuncio de Meta) y
  //    moverla a un concepto del banco con el mismo (stage, format, name).
  let bankMoved = false;
  const adId = variation.meta_ad_id || _metaId(variation.meta_ads_library_url);
  if (adId) {
    const bankBoard = await getBoardByCompany(BANK_REFS_COMPANY_ID, "ads");
    if (bankBoard?.id) {
      const { data: bankConcepts } = await database.from("despliegue_concepts")
        .select("id, stage, format, name").eq("board_id", bankBoard.id).eq("archived", false);
      const cids = (bankConcepts || []).map((c) => c.id);
      if (cids.length) {
        const { data: bankVars } = await database.from("despliegue_variations")
          .select("id, concept_id, meta_ad_id, meta_ads_library_url").in("concept_id", cids);
        const twin = (bankVars || []).find((v) => (v.meta_ad_id || _metaId(v.meta_ads_library_url)) === adId);
        if (twin) {
          const norm = (s) => (s || "").trim().toLowerCase();
          let dest = (bankConcepts || []).find((c) => c.stage === targetConcept.stage && c.format === targetConcept.format && norm(c.name) === norm(targetConcept.name));
          if (!dest) dest = await createBankConcept({ pipelineType: "ads", stage: targetConcept.stage, format: targetConcept.format, name: targetConcept.name });
          if (twin.concept_id !== dest.id) await moveVariationToConcept({ variationId: twin.id, targetConceptId: dest.id });
          bankMoved = true;
        }
      }
    }
  }
  return { clientMoved: true, bankMoved };
}

// Lista boards activos por empresa — para el selector "importar a empresa X
// (ads | organic)". Devuelve `[{ company_id, company_name, slug, ads, organic }]`.
export async function listBoardsByCompany() {
  const [{ data: boards }, { data: companies }] = await Promise.all([
    database.from("despliegue_boards").select("id, company_id, pipeline_type").eq("active", true),
    database.from("companies").select("id, name, slug").order("name", { ascending: true }),
  ]);
  const byCompany = new Map();
  for (const b of boards || []) {
    const slot = byCompany.get(b.company_id) || { ads: null, organic: null };
    slot[b.pipeline_type] = b.id;
    byCompany.set(b.company_id, slot);
  }
  const all = (companies || []).map((c) => {
    const slot = byCompany.get(c.id) || { ads: null, organic: null };
    return {
      company_id: c.id,
      company_name: c.name,
      company_slug: c.slug,
      ads_board_id: slot.ads || null,
      organic_board_id: slot.organic || null,
    };
  });
  // Dedupe por SLUG: si hay empresas duplicadas con el mismo slug (ej. dos "Splicito"
  // creadas por error), colapsamos a UNA sola en el picker de import, prefiriendo la
  // que ya tiene board (ads u organic). Así nunca se importa a una empresa "fantasma"
  // vacía. Slug vacío/null NO se colapsa (empresas legítimamente sin slug).
  const out = [];
  const bySlug = new Map();
  for (const r of all) {
    const slug = (r.company_slug || "").trim().toLowerCase();
    if (!slug) { out.push(r); continue; }
    const prev = bySlug.get(slug);
    if (!prev) { bySlug.set(slug, r); out.push(r); continue; }
    const prevHasBoard = !!(prev.ads_board_id || prev.organic_board_id);
    const rHasBoard = !!(r.ads_board_id || r.organic_board_id);
    if (rHasBoard && !prevHasBoard) { out[out.indexOf(prev)] = r; bySlug.set(slug, r); }
    // si no, se descarta la duplicada (queda la que ya estaba, con board)
  }
  return out;
}
