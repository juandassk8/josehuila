import { database, ensureFreshSession } from "../../lib/backend.js";
import { getOrCreateBoard, createConcept, createVariation, updateVariation } from "../../despliegue/db.js";
import { BANK_REFS_COMPANY_ID, listBankConcepts, deleteVariationsBulk, listBankVariations, updateBankConcept } from "../concept_bank/db.js";
import { buildApiHeaders } from "../../lib/apiAuth.js";
// La lógica de importación vive en api/_lib para que el worker del servidor
// use exactamente la misma. Acá solo se le inyecta el entorno del navegador.
import {
  importAds, dedupeAds, claveCreativo, isFacebookAdsLibrary,
  adIdFromMetaUrl, parseDiscoverAds,
} from "../../../api/_lib/inboxImport.js";
import { urlDeBusqueda } from "../../../api/_lib/apify.js";
import {
  buildKnownFormats as construirFormatos,
  buildKnownLabels as construirEtiquetas,
  parcheDeResultadoIA,
} from "../../../api/_lib/inboxAi.js";
import { logger } from "../../lib/logger.js";
import { mergeLabelValue } from "../../despliegue/labels.js";
import { transcribeAudioFile } from "../../lib/audioTranscribe.js";
import { extractVideoCover } from "../../lib/videoFrame.js";
import { uploadCoverBlob, uploadVideoBlob } from "../../despliegue/storage.js";
import { isOwnStorage } from "../../lib/coverUrl.js";
import { uploadVideoToDrive } from "../../lib/driveUpload.js";

// Emoji por etapa para nombrar la subcarpeta de Drive (espeja api/classify-ad).
const STAGE_EMOJI = { tofu: "🟢", mofu: "🟡", bofu: "🔴" };

// Capa de datos de la Bandeja de Referentes (tabla reference_inbox).
// RLS team-only: todas las queries van con el JWT del admin (database singleton).
// Patrón `.select()` después de escribir → un bloqueo RLS se ve como count 0
// en vez de fallar en silencio (igual que deleteConceptCompletely del banco).

const TABLE = "reference_inbox";

// Re-exportadas tal cual para no tocar los ~30 sitios que ya las importan de acá.
export { dedupeAds, claveCreativo, isFacebookAdsLibrary };

// ¿Es un link de Google Drive (archivo compartido)?
export function isDriveLink(url) {
  return /drive\.google\.com|docs\.google\.com/i.test(url || "");
}

// Convierte un link de Drive (ver/compartir) al de descarga directa del binario.
// El archivo debe estar compartido como "cualquiera con el link" para que el
// server pueda bajarlo (o haber sido subido por la app, que ya lo deja público).
export function driveDownloadUrl(url) {
  const m = (url || "").match(/\/d\/([\w-]{20,})|[?&]id=([\w-]{20,})/);
  const id = m && (m[1] || m[2]);
  return id ? `https://drive.google.com/uc?export=download&id=${id}` : url;
}

async function currentUserId() {
  const { data } = await database.auth.getUser();
  return data?.user?.id || null;
}

// Lista items de la bandeja, opcionalmente filtrando por status/empresa.
export async function listInbox({ status = null, companyId = null } = {}) {
  let q = database.from(TABLE).select("*").order("created_at", { ascending: false });
  if (status) q = q.eq("status", status);
  if (companyId) q = q.eq("company_id", companyId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

// Agrega uno o varios links a la bandeja (bulk por líneas). Solo acepta links
// de Facebook Ads Library; el resto se ignora. La configuración (empresa,
// pipeline, etapa, tipo, concepto) se pre-guarda en cada item — no obligatorio.
// Devuelve { created, skipped } (skipped = links descartados por no ser de FB).
export async function addInboxItems({
  urls = [], companyId = null, pipelineType = "ads", note = null,
  stage = null, mediaType = null, format = null, targetConceptId = null,
} = {}) {
  const all = [...new Set(
    (Array.isArray(urls) ? urls : String(urls).split("\n"))
      .map((u) => (u || "").trim())
      .filter(Boolean)
  )];
  const clean = all.filter(isFacebookAdsLibrary);
  let skipped = all.length - clean.length;
  if (clean.length === 0) return { created: [], skipped };
  // Dedup contra lo YA existente en la bandeja (por source_url), en lotes — antes
  // solo se deduplicaba dentro del texto pegado, así que re-pegar creaba duplicados.
  const seen = new Set();
  for (let i = 0; i < clean.length; i += 80) {
    const batch = clean.slice(i, i + 80);
    const { data: existing, error: exErr } = await database.from(TABLE).select("source_url").in("source_url", batch);
    if (exErr) throw exErr;
    for (const r of existing || []) seen.add(r.source_url);
  }
  const uniq = clean.filter((u) => !seen.has(u));
  skipped += clean.length - uniq.length;
  if (uniq.length === 0) return { created: [], skipped };
  const uid = await currentUserId();
  const rows = uniq.map((url) => ({
    source_url: url,
    source_platform: "meta",
    status: "pending",
    company_id: companyId || null,
    pipeline_type: pipelineType || "ads",
    note: note?.trim() || null,
    created_by: uid,
    source_kind: "manual",
    suggested_stage: stage || null,
    suggested_media_type: mediaType || null,
    suggested_format: format?.trim() || null,
    target_concept_id: targetConceptId || null,
  }));
  const { data, error } = await database.from(TABLE).insert(rows).select();
  if (error) throw error;
  return { created: data || [], skipped };
}

// Clasifica en lote varios items durante la revisión: suma etiquetas (unión por
// categoría) y, si se pasan, setea etapa / tipo / formato. Todo opcional — para
// el caso "Jason no supo qué etiqueta, lo hago yo después".
// `reemplazar` existe porque la IA se puede equivocar en TANDA: 80 anuncios de
// sillas gamer entraron como "Salud", "Ropa" y "Calzado" porque el banco no
// tenía un nicho de muebles. Sumando quedaban ["Salud","Muebles"] — el dato
// falso sobrevive. Al corregir un error hay que poder pisar, no agregar.
export async function classifyInboxBulk(ids, { addLabels = {}, stage = null, mediaType = null, format = null, reemplazar = false } = {}) {
  if (!ids?.length) return { count: 0 };
  const cats = Object.keys(addLabels).filter((c) => (addLabels[c] || []).length > 0);
  const setFields = {};
  if (stage) setFields.suggested_stage = stage;
  if (mediaType) setFields.suggested_media_type = mediaType;
  if (format?.trim()) setFields.suggested_format = format.trim();
  if (cats.length === 0 && Object.keys(setFields).length === 0) return { count: 0 };

  const { data: rows, error } = await database
    .from(TABLE)
    .select("id, suggested_labels")
    .in("id", ids);
  if (error) throw error;
  await Promise.all((rows || []).map((r) => {
    const labels = { ...(r.suggested_labels || {}) };
    for (const cat of cats) {
      const nuevas = addLabels[cat] || [];
      if (reemplazar) { labels[cat] = [...nuevas]; continue; }
      // `mergeLabelValue` en vez de un Set: un Set deja pasar "Muebles" y
      // "muebles" como dos etiquetas distintas.
      let acc = Array.isArray(labels[cat]) ? [...labels[cat]] : [];
      for (const v of nuevas) acc = mergeLabelValue(acc, v);
      labels[cat] = acc;
    }
    return database.from(TABLE).update({ ...setFields, suggested_labels: labels }).eq("id", r.id);
  }));
  return { count: (rows || []).length };
}

// Actualiza campos editables de un item (suggested_*, cover_url, etc.).
export async function updateInboxItem(id, patch) {
  const { data, error } = await database
    .from(TABLE)
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Cambia solo el status (aprobar/rechazar rápido en el triage).
export async function setInboxStatus(id, status) {
  return updateInboxItem(id, { status });
}

export async function setInboxStatusBulk(ids, status) {
  if (!ids?.length) return { count: 0 };
  const { data, error } = await database
    .from(TABLE)
    .update({ status })
    .in("id", ids)
    .select("id");
  if (error) throw error;
  return { count: (data || []).length };
}

// Asigna empresa destino a varios items de una.
export async function assignCompanyBulk(ids, companyId) {
  if (!ids?.length) return { count: 0 };
  const { data, error } = await database
    .from(TABLE)
    .update({ company_id: companyId || null })
    .in("id", ids)
    .select("id");
  if (error) throw error;
  return { count: (data || []).length };
}

export async function deleteInboxItem(id) {
  const { data, error } = await database.from(TABLE).delete().eq("id", id).select("id");
  if (error) throw error;
  return { count: (data || []).length };
}

export async function deleteInboxBulk(ids) {
  if (!ids?.length) return { count: 0 };
  const { data, error } = await database.from(TABLE).delete().in("id", ids).select("id");
  if (error) throw error;
  return { count: (data || []).length };
}

// ───── Fase 2A: análisis con IA ───────────────────────────────────────────

export async function buildKnownFormats() {
  return construirFormatos(database);
}

export async function buildKnownLabels() {
  return construirEtiquetas(database);
}

// ───── Backfill de patrones de formato ───────────────────────────────────────
// Los formatos del banco SIN `description`/`execution` no le dan a la IA contra
// qué comparar → cae en el genérico "UGC". Este helper destila el patrón (modo
// `synthesize`, que ya existe) desde las refs (transcript + notas) de cada formato
// que le falta patrón, y lo guarda en el concepto. Así buildKnownFormats tiene
// patrones ricos para clasificar mejor. onProgress(msg). No pisa lo que ya existe
// (salvo force). Devuelve { filled, skipped, failed, total }.
export async function ensureFormatPatterns(pipelineType = "ads", { onProgress = null, force = false, minRefs = 1 } = {}) {
  onProgress?.("Buscando formatos sin patrón…");
  const concepts = (await listBankConcepts()).filter((c) => (c.pipeline_type || "ads") === pipelineType);
  const hasPattern = (c) => (c.description || "").trim() && (c.execution || "").trim();
  const missing = concepts.filter((c) => force || !hasPattern(c));
  if (!missing.length) return { filled: 0, skipped: 0, failed: 0, total: 0 };

  // Refs del banco agrupadas por concepto (una sola query en lote).
  const vars = await listBankVariations(pipelineType);
  const byConcept = new Map();
  for (const v of vars) {
    if (!byConcept.has(v.concept_id)) byConcept.set(v.concept_id, []);
    byConcept.get(v.concept_id).push(v);
  }

  let filled = 0, skipped = 0, failed = 0, i = 0;
  for (const c of missing) {
    onProgress?.(`Patrón ${++i}/${missing.length}: ${c.name}…`);
    const refs = (byConcept.get(c.id) || [])
      .map((v) => ({ name: v.name, notes: v.notes, transcript: v.transcript, labels: v.bank_labels }))
      .filter((r) => (r.transcript && r.transcript.trim()) || (r.notes && r.notes.trim()));
    if (refs.length < minRefs) { skipped++; continue; }   // sin material para destilar
    try {
      const resp = await fetch("/api/classify-ad", {
        method: "POST", headers: await buildApiHeaders(),
        body: JSON.stringify({ mode: "synthesize", formatName: c.name, references: refs }),
      });
      const data = await resp.json();
      if (!resp.ok || !(data.description || data.execution)) { failed++; continue; }
      const patch = {};
      if (force || !(c.description || "").trim()) patch.description = data.description || null;
      if (force || !(c.execution || "").trim()) patch.execution = data.execution || null;
      if (Object.keys(patch).length) { await updateBankConcept(c.id, patch); filled++; }
      else skipped++;
    } catch { failed++; }
  }
  return { filled, skipped, failed, total: missing.length };
}

// Escribe el resultado de la IA en el item y lo deja en 'ready' para revisión.
// Si el ítem YA tenía un concepto asignado (Config fija / documento), NO lo
// pisamos con lo que adivinó la IA (ni el concepto ni el nombre de formato) —
// el usuario mandó. La IA igual llena marca/nicho/ángulo/transcript/etc.
async function writeAiResult(itemId, result, item = null) {
  return updateInboxItem(itemId, parcheDeResultadoIA(result, item));
}

// Analiza un item con IA (modo auto desde el link de Facebook Ads Library).
// Marca 'enriching' mientras corre. Si Meta bloquea el fetch, devuelve
// { needsFile:true, reason } para que el front pida el archivo de video.
export async function analyzeInboxItem(item, knownFormats = null, knownLabels = null) {
  const formats = knownFormats || (await buildKnownFormats());
  const labels = knownLabels || (await buildKnownLabels());
  await setInboxStatus(item.id, "enriching");
  try {
    let videoUrl = item.ai_raw?.video_url || null;
    let cover = item.cover_url || null;
    let transcript = (typeof item.transcript === "string" && item.transcript.trim()) ? item.transcript : null;
    let fpBrand = null;

    // Si es un link de Meta SIN video (pegado a mano), lo enriquecemos con
    // FOREPLAY por el ad_id → nos da video/portada/transcript. Así el video se
    // baja y se respalda a Drive, esquivando el bloqueo de Meta al servidor.
    if (!videoUrl) {
      const m = (item.source_url || "").match(/[?&]id=(\d{5,})/);
      if (m) {
        try {
          const fp = await fetchForeplayOneAd(m[1]);
          if (fp) {
            videoUrl = fp.video_url || videoUrl;
            cover = cover || fp.cover_url || null;
            if (!transcript && fp.transcript) transcript = fp.transcript;
            fpBrand = fp.brand || null;
          }
        } catch { /* Foreplay no lo tiene → seguimos con el flujo normal (auto/needsFile) */ }
      }
    }

    const hasTranscript = !!(transcript && transcript.trim());
    // Si el ítem ya trae una marca (lote de una marca, o la de Foreplay), la
    // fijamos para que la IA no la cambie en cada anuncio.
    const forcedMarca = item.suggested_labels?.marca?.[0] || fpBrand || null;
    const base = { knownFormats: formats, knownLabels: labels, forcedMarca };
    let body;
    // Con video → modo video (baja el video → respalda a Drive), reusando la
    // transcripción si ya la tenemos (no re-transcribe).
    if (videoUrl) body = { ...base, videoUrl, coverUrl: cover, transcript: hasTranscript ? transcript : undefined };
    else if (hasTranscript) body = { ...base, transcript, coverUrl: cover };
    else if (cover) body = { ...base, coverUrl: cover, imageOnly: true };
    else body = { ...base, sourceUrl: item.source_url };
    const resp = await fetch("/api/classify-ad", {
      method: "POST",
      headers: await buildApiHeaders(),
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error || `Error ${resp.status}`);
    if (data.needsFile) {
      // Ni Foreplay ni Meta dieron el video → marcamos que necesita el archivo,
      // para mostrarlo claro en la tarjeta (no dejarlo ambiguo como "sin clasificar").
      await updateInboxItem(item.id, {
        status: "pending",
        ai_raw: { ...(item.ai_raw || {}), needs_file: true, needs_file_reason: data.reason || null },
      });
      return { needsFile: true, reason: data.reason };
    }
    // Preserva el video_url original (p.ej. de Foreplay) si el análisis no lo trajo.
    if (!data.video_url && item.ai_raw?.video_url) data.video_url = item.ai_raw.video_url;
    const updated = await writeAiResult(item.id, data, item);
    return { item: updated };
  } catch (e) {
    await setInboxStatus(item.id, "pending");
    throw e;
  }
}

// Re-clasifica SOLO las etiquetas (marca/nicho/subnicho/ángulo/formato) de items
// que YA tienen transcripción o portada guardada — SIN re-bajar ni re-transcribir el
// video (barato: 1 llamada de texto por item, con el system prompt cacheado). Preserva
// la marca ya detectada (forcedMarca) y el formato pre-asignado; actualiza únicamente
// suggested_labels, sin tocar transcript / descripción / status / respaldo en Drive.
// Ideal para re-etiquetar en bloque tras mejorar el prompt, sin re-analizar todo.
export async function reclassifyLabelsBulk(items, { concurrency = 4, onProgress = null } = {}) {
  const labels = await buildKnownLabels();
  const formats = await buildKnownFormats();
  const total = items.length;
  let done = 0, updated = 0, skipped = 0, failed = 0;
  let sampleReason = null; // primera razón (para diagnóstico en la UI)
  const queue = [...items];
  const prog = () => onProgress?.(`Reorganizando etiquetas ${done}/${total}…`);

  async function worker() {
    while (queue.length) {
      const item = queue.shift();
      const transcript = (typeof item.transcript === "string" && item.transcript.trim()) ? item.transcript : null;
      const cover = item.cover_url || null;
      if (!transcript && !cover) {
        skipped++; if (!sampleReason) sampleReason = "sin transcripción ni portada guardada";
        done++; prog(); continue;
      }
      // forcedMarca mantiene la marca estable (Jose solo quiere afinar el subnicho).
      const forcedMarca = item.suggested_labels?.marca?.[0] || null;
      const base = { knownFormats: formats, knownLabels: labels, forcedMarca };
      // Con transcript: NO mandamos la portada. Las portadas de Meta (fbcdn) suelen
      // estar EXPIRADAS; classify-ad se la pasaría a Claude como URL y Claude falla
      // al bajarla → 500. El transcript solo alcanza para re-clasificar etiquetas.
      // Sin transcript: único recurso es la portada (imageOnly) — si expiró, se salta.
      const body = transcript ? { ...base, transcript } : { ...base, coverUrl: cover, imageOnly: true };
      try {
        const resp = await fetch("/api/classify-ad", {
          method: "POST", headers: await buildApiHeaders(), body: JSON.stringify(body),
        });
        const data = await resp.json().catch(() => ({}));
        if (resp.ok && data?.suggested_labels) {
          // Preservar el formato pre-asignado (sub-concepto), igual que writeAiResult.
          const pre = item.suggested_labels || {};
          const merged = { ...data.suggested_labels };
          if (Array.isArray(pre.formato) && pre.formato.length) merged.formato = pre.formato;
          await updateInboxItem(item.id, { suggested_labels: merged });
          updated++;
        } else if (data?.needsFile || data?.ok === false) {
          // No es un error duro: no hay material re-clasificable barato (video sin
          // audio → sin transcript; o portada expirada). Requiere re-analizar.
          skipped++;
          if (!sampleReason) sampleReason = data.reason || "sin transcripción; portada no disponible";
        } else {
          failed++;
          if (!sampleReason) sampleReason = data?.error || `HTTP ${resp.status}`;
        }
      } catch (e) {
        logger.error("reclassifyLabelsBulk falló", e);
        failed++;
        if (!sampleReason) sampleReason = e?.message || String(e);
      }
      done++; prog();
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker));
  return { updated, skipped, failed, total, sampleReason };
}

// ───── Fase 2B: Foreplay ────────────────────────────────────────────────────

export async function fetchForeplayBoards() {
  const resp = await fetch("/api/foreplay-sync?action=boards", {
    method: "POST", headers: await buildApiHeaders(), body: JSON.stringify({ action: "boards" }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error || `Error ${resp.status}`);
  return { boards: data.boards || [], credits: data.credits ?? null };
}

// opts = { order, minDays, activeOnly } — por defecto trae los que llevan más
// tiempo corriendo (ganadores).
export async function fetchForeplayAds(boardId, limit = 50, opts = {}) {
  const resp = await fetch("/api/foreplay-sync?action=ads", {
    method: "POST", headers: await buildApiHeaders(),
    body: JSON.stringify({ action: "ads", boardId, limit, order: opts.order, minDays: opts.minDays, activeOnly: opts.activeOnly }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error || `Error ${resp.status}`);
  return { ads: data.ads || [], credits: data.credits ?? null };
}

// Trae UN anuncio de Foreplay por su ad_id de Meta (para enriquecer links
// pegados a mano con video/portada/transcript, esquivando el bloqueo de Meta).
export async function fetchForeplayOneAd(adId) {
  const resp = await fetch("/api/foreplay-sync?action=one_ad", {
    method: "POST", headers: await buildApiHeaders(), body: JSON.stringify({ action: "one_ad", adId }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error || `Error ${resp.status}`);
  return data.ad || null;
}

// ───── Apify: traer videos de Meta (lo que Foreplay no tiene) ────────────────
// Meta bloquea el fetch directo del servidor; Apify (actor dedicado) sí resuelve
// la Biblioteca de Anuncios. No lee anuncios por id, pero por MARCA trae muchos de
// una, cada uno con su ad_archive_id → matcheamos los faltantes por id.


// Caché de sesión: no re-scrapear la misma marca (mejora #2). Se limpia al recargar.
const _apifyCache = new Map();

// Corre `fn` sobre `items` con concurrencia limitada (mejora #1: en paralelo).
async function parallelPool(items, concurrency, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx); }
  });
  await Promise.all(workers);
  return out;
}

// Scrapea una marca en la Biblioteca de Anuncios. Por keyword (q=) o, si se pasa
// pageId, por página exacta (view_all_page_id — mejora #3, más cobertura).
// Devuelve { ok, results:[{ad_id, page_name, video_url, image_url, copies,
// start_date, is_active, ad_library_url, media_type, ...}], reason }.
export async function apifyScrapeBrand(brand, { count = 300, pageId = null } = {}) {
  const key = pageId ? `page:${pageId}:${count}` : `q:${(brand || "").toLowerCase()}:${count}`;
  if (_apifyCache.has(key)) return _apifyCache.get(key);
  const bodyReq = pageId
    ? { pageId, count }
    : { url: urlDeBusqueda(brand), count };
  const resp = await fetch("/api/apify-ad", {
    method: "POST", headers: await buildApiHeaders(), body: JSON.stringify(bodyReq),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error || `Error ${resp.status}`);
  if (data.ok !== false) _apifyCache.set(key, data);   // no cachear fallos
  return data;
}

// 🔎 Trae los anuncios de una marca: scrapea y devuelve hasta N, en el orden
// natural de Meta (los recientes primero) — SIN ordenar por antigüedad. Forma de
// "ad" de Foreplay → reusa importForeplayAds.
export async function discoverBrandTopAds(brand, { topN = 100, count = 500, pageId = null, mediaOnly = null, onProgress = null } = {}) {
  onProgress?.(pageId
    ? `Buscando la página exacta en Meta (hasta ${count})…`
    : `Buscando "${brand}" en Meta (hasta ${count})…`);
  const data = await apifyScrapeBrand(brand, { count, pageId });
  if (data.ok === false) return { ads: [], totalFound: 0, brand, reason: data.reason };
  return parseDiscoverAds(data.results, { brand, topN, mediaOnly });
}

// Enriquece los faltantes con Apify: junta el universo de marcas (de TODOS los
// items + extras que pase el usuario), scrapea cada una, arma el mapa por ad_id y
// parchea cada faltante encontrado con el video + la marca corregida (page_name).
// Devuelve { matched, matchedItems, brandsScraped, totalAds, brands, reason }.
export async function enrichFaltantesWithApify(faltantes, { allItems = [], extraBrands = [], scopeBrandsToTargets = false, perBrand = 300, onProgress = null } = {}) {
  const targets = (faltantes || []).map((it) => ({ it, adId: adIdFromMetaUrl(it.source_url) })).filter((t) => t.adId);
  if (!targets.length) return { matched: 0, matchedItems: [], brandsScraped: 0, totalAds: 0, brands: [], reason: "Ningún faltante tiene link de Meta con id." };

  // Marcas a buscar. En corrida acotada (selección) → solo las de los seleccionados
  // (rápido). En corrida completa → TODAS las marcas conocidas de la bandeja (los
  // ya analizados las tienen) para matchear por id los faltantes que no traen marca.
  const brandSource = scopeBrandsToTargets ? faltantes : (allItems.length ? allItems : faltantes);
  const brandSet = new Map();  // lowerkey → escritura display
  const pushBrand = (b) => { const s = (b || "").trim(); if (s && s.length >= 2) { const k = s.toLowerCase(); if (!brandSet.has(k)) brandSet.set(k, s); } };
  for (const it of brandSource) pushBrand(it.suggested_labels?.marca?.[0]);
  for (const b of extraBrands) pushBrand(b);
  const brands = [...brandSet.values()];
  if (!brands.length) return { matched: 0, matchedItems: [], brandsScraped: 0, totalAds: 0, brands: [], reason: "No hay marcas conocidas para buscar. Agregá marcas a mano en el cuadro de 'marcas extra' y reintentá." };

  // Scrapea las marcas EN PARALELO (mejora #1) con caché (mejora #2) → mapa
  // ad_id → mejor resultado (prioriza los que traen video).
  const map = new Map();
  let totalAds = 0, done = 0;
  await parallelPool(brands, 4, async (b) => {
    onProgress?.(`Buscando en Meta: ${b} (${++done}/${brands.length})…`);
    try {
      const data = await apifyScrapeBrand(b, { count: perBrand });
      for (const r of (data.results || [])) {
        totalAds++;
        if (!r.ad_id) continue;
        const prev = map.get(r.ad_id);
        if (!prev || (!prev.video_url && r.video_url)) map.set(r.ad_id, r);
      }
    } catch (e) { onProgress?.(`⚠ ${b}: ${e?.message || e}`); }
  });

  // Matchea faltantes por ad_id y parchea (video + marca corregida + portada).
  const matchedItems = [];
  for (const { it, adId } of targets) {
    const r = map.get(adId);
    if (!r || (!r.video_url && !r.image_url)) continue;   // sin creativo utilizable → sigue faltante
    const marca = (r.page_name || it.suggested_labels?.marca?.[0] || "").trim();
    const labels = { ...(it.suggested_labels || {}) };
    if (marca) labels.marca = [marca];
    const patch = {
      ai_raw: { ...(it.ai_raw || {}), video_url: r.video_url || it.ai_raw?.video_url || null, needs_file: false, needs_file_reason: null, apify: true },
      suggested_labels: labels,
    };
    if (!it.cover_url && r.image_url) patch.cover_url = r.image_url;
    try { matchedItems.push(await updateInboxItem(it.id, patch)); } catch { /* se refleja al recargar */ }
  }
  return { matched: matchedItems.length, matchedItems, brandsScraped: brands.length, totalAds, brands };
}

// Descubrir por marca: seed = link de anuncio / dominio / nombre de marca.
export async function fetchForeplayDiscover(seed, limit = 30, opts = {}) {
  const resp = await fetch("/api/foreplay-sync?action=discover", {
    method: "POST", headers: await buildApiHeaders(),
    body: JSON.stringify({ action: "discover", seed, limit, order: opts.order, minDays: opts.minDays, activeOnly: opts.activeOnly }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error || `Error ${resp.status}`);
  return { ads: data.ads || [], credits: data.credits ?? null };
}

// Inserta ads de Foreplay en la bandeja, deduplicando por source_url contra lo
// que ya está. Guarda transcript/cover/marca si Foreplay los trae. Devuelve
// { created, skipped }.
// Separa lo que YA ESTABA en la base de lo que Meta devolvió REPETIDO.
//
// Mezclar las dos cosas en un solo "ya estaban" hacía que el mensaje mintiera:
// José importó una marca nueva, nunca antes traída, y le dijo "79 ya estaban".
// No estaban en ningún lado — eran el mismo creativo corriendo en varios
// anuncios, que es lo normal en Meta.
//
// La clave del creativo lleva la marca: dos marcas distintas no comparten
// video. Y solo se cae al cover cuando el anuncio ES estático: un video sin
// `video_url` (Meta lo sacó) comparte miniatura genérica con otros, y colapsar
// por eso perdería anuncios distintos.
// Pide al servidor una copia PROPIA de cada portada. Se hace al importar, que es
// el único momento en que la URL de Meta está viva con seguridad: las de fbcdn
// caducan en días y después devuelven 403 para siempre — desde el navegador y
// desde el servidor por igual.
//
// Va por el servidor porque fbcdn exige `Referer` de Facebook y desde la página
// CORS lo bloquea. Mejor esfuerzo: la que no se pueda bajar conserva su URL
// original, que es preferible a quedarse sin portada.
export async function blindarPortadas(urls, { onProgress = null, huellas = null } = {}) {
  const pendientes = [...new Set((urls || []).filter(Boolean).map(String))];
  const mapa = new Map();
  const TANDA = 25;
  for (let i = 0; i < pendientes.length; i += TANDA) {
    const tanda = pendientes.slice(i, i + TANDA);
    onProgress?.(`Guardando portadas ${Math.min(i + tanda.length, pendientes.length)}/${pendientes.length}…`);
    try {
      const resp = await fetch("/api/rehost-covers", {
        method: "POST",
        headers: await buildApiHeaders(),
        body: JSON.stringify({ urls: tanda }),
      });
      const json = await resp.json().catch(() => ({}));
      for (const [orig, nueva] of Object.entries(json.covers || {})) if (nueva) mapa.set(orig, nueva);
      // La huella la calcula el servidor sobre los bytes; acá solo se recoge.
      if (huellas) for (const [orig, h] of Object.entries(json.hashes || {})) if (h) huellas.set(orig, h);
    } catch (e) {
      logger.error("[blindarPortadas] tanda falló", e);   // se sigue con la original
    }
  }
  return mapa;
}

export async function importForeplayAds(ads, { companyId = null, pipelineType = "ads", incluirCopias = false, onProgress = null } = {}) {
  return importAds(database, ads, {
    companyId, pipelineType, incluirCopias, onProgress,
    createdBy: await currentUserId(),
    // Desde la página no se puede bajar de fbcdn: exige Referer de Facebook y
    // CORS lo bloquea. Va por el servidor.
    rehostCovers: blindarPortadas,
    onError: (msg, e) => logger.error(msg, e),
  });
}

// Fallback: el equipo sube el archivo de video; lo transcribimos en el navegador
// (transcribeAudioFile ya extrae el audio y chunkea >25MB) y clasificamos con
// ese transcript. Sirve cuando Meta bloquea el fetch del server.
export async function analyzeInboxItemFromFile(item, file, knownFormats = null, onProgress = null, knownLabels = null) {
  const formats = knownFormats || (await buildKnownFormats());
  const labels = knownLabels || (await buildKnownLabels());
  await setInboxStatus(item.id, "enriching");
  try {
    const transcript = await transcribeAudioFile(file, onProgress);
    const resp = await fetch("/api/classify-ad", {
      method: "POST",
      headers: await buildApiHeaders(),
      body: JSON.stringify({ transcript, coverUrl: item.cover_url || null, knownFormats: formats, knownLabels: labels }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error || `Error ${resp.status}`);
    const updated = await writeAiResult(item.id, data, item);
    return { item: updated };
  } catch (e) {
    await setInboxStatus(item.id, "pending");
    throw e;
  }
}

// ───── Subir videos directo (sin Foreplay/Meta) ──────────────────────────
// El equipo descarga el anuncio y sube el archivo; la app hace TODO el cerebro:
// portada + transcripción + clasificación (marca/nicho/ángulo/formato) + respaldo
// a Drive. Es el camino más confiable: el video que subís ES la fuente.

// Crea un item 'pending' por cada archivo subido y lo empareja con su File.
export async function createUploadInboxItems(files, { companyId = null, pipelineType = "ads" } = {}) {
  const uid = await currentUserId();
  const pairs = [];
  for (const f of Array.from(files || [])) {
    const safe = (f.name || "video").replace(/[^\w.\- ]+/g, "_").slice(0, 120);
    const { data, error } = await database.from(TABLE).insert({
      source_url: `upload://${safe}`,       // placeholder (NOT NULL); se cambia al link de Drive tras respaldar
      source_platform: "upload",
      status: "pending",
      company_id: companyId || null,
      pipeline_type: pipelineType || "ads",
      created_by: uid,
      source_kind: "upload",
    }).select().single();
    if (error) throw error;
    pairs.push({ item: data, file: f });
  }
  return pairs;
}

// Crea items desde links de Google Drive (videos ya subidos por Jose). El link
// ES el respaldo — no re-subimos nada. Se analizan bajando el video del Drive.
export async function addDriveInboxItems(driveUrls, { companyId = null, pipelineType = "ads", note = null, stage = null, format = null, targetConceptId = null } = {}) {
  const urls = [...new Set((driveUrls || []).map((u) => (u || "").trim()).filter(isDriveLink))];
  if (urls.length === 0) return { created: [] };
  const uid = await currentUserId();
  const rows = urls.map((url) => ({
    source_url: url,                    // el link de Drive queda como fuente Y respaldo
    source_platform: "drive",
    status: "pending",
    company_id: companyId || null,
    pipeline_type: pipelineType || "ads",
    note: note?.trim() || null,
    created_by: uid,
    source_kind: "drive",
    suggested_stage: stage || null,
    suggested_media_type: "video",
    suggested_format: format?.trim() || null,
    target_concept_id: targetConceptId || null,
    video_backup_url: url,              // ya está en Drive
  }));
  const { data, error } = await database.from(TABLE).insert(rows).select();
  if (error) throw error;
  return { created: data || [] };
}

// Analiza un video que YA vive en Drive: baja el binario del link, transcribe y
// clasifica. No re-sube a Drive (el link original es el respaldo).
export async function analyzeDriveVideo(item, knownFormats = null, knownLabels = null, onProgress = null) {
  const formats = knownFormats || (await buildKnownFormats());
  const labels = knownLabels || (await buildKnownLabels());
  await setInboxStatus(item.id, "enriching");
  try {
    onProgress?.("Abriendo el video de Drive…");
    const dl = driveDownloadUrl(item.source_url);
    onProgress?.("Analizando con IA…");
    const resp = await fetch("/api/classify-ad", {
      method: "POST",
      headers: await buildApiHeaders(),
      body: JSON.stringify({
        videoUrl: dl,
        backupUrl: item.source_url,       // el link de Drive es el respaldo (no re-subir)
        coverUrl: item.cover_url || null,
        knownFormats: formats, knownLabels: labels,
      }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error || `Error ${resp.status}`);
    if (data.needsFile) {
      await updateInboxItem(item.id, { status: "pending", ai_raw: { ...(item.ai_raw || {}), needs_file: true, needs_file_reason: "No se pudo abrir el video del Drive. Compartilo como 'cualquiera con el link' (o subí el archivo)." } });
      return { needsFile: true };
    }
    data.suggested_media_type = "video";
    if (!data.drive_url) data.drive_url = item.source_url;   // writeAiResult → video_backup_url
    const updated = await writeAiResult(item.id, data, item);
    return { item: updated };
  } catch (e) {
    await setInboxStatus(item.id, "pending");
    throw e;
  }
}

// Analiza un video (o imagen) subido a mano: portada → transcript → IA → Drive.
export async function analyzeUploadedVideo(item, file, knownFormats = null, knownLabels = null, onProgress = null) {
  const formats = knownFormats || (await buildKnownFormats());
  const labels = knownLabels || (await buildKnownLabels());
  const isVideo = (file?.type || "").startsWith("video/");
  await setInboxStatus(item.id, "enriching");
  try {
    // 1) Portada: fotograma del video (o la imagen tal cual) → Supabase, para que la IA lo vea.
    let coverUrl = item.cover_url || null;
    try {
      onProgress?.("Tomando portada…");
      if (isVideo) { const frame = await extractVideoCover(file); if (frame) coverUrl = await uploadCoverBlob(frame); }
      else { coverUrl = await uploadCoverBlob(file); }
    } catch { /* seguimos sin portada */ }

    // 2) Transcripción en el navegador (aguanta videos grandes troceando).
    let transcript = "";
    if (isVideo) {
      try { transcript = await transcribeAudioFile(file, onProgress); }
      catch { /* sin audio o error → clasificamos por la portada */ }
    }

    // 3) Clasificar con IA (portada + transcript) → marca/nicho/ángulo/formato conectados al banco.
    onProgress?.("Analizando con IA…");
    const hasT = !!(transcript && transcript.trim());
    const body = hasT
      ? { transcript, coverUrl, knownFormats: formats, knownLabels: labels }
      : { coverUrl, imageOnly: true, knownFormats: formats, knownLabels: labels };
    const resp = await fetch("/api/classify-ad", { method: "POST", headers: await buildApiHeaders(), body: JSON.stringify(body) });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error || `Error ${resp.status}`);
    if (data.needsFile) throw new Error("La IA no pudo analizar el archivo.");
    if (isVideo) data.suggested_media_type = "video";      // es un video subido: no dejar que lo marque estático
    if (!data.cover_url && coverUrl) data.cover_url = coverUrl;
    if (typeof data.transcript !== "string") data.transcript = transcript;
    let updated = await writeAiResult(item.id, data, item);

    // 4) Respaldo CONFIABLE: el navegador sube el video a Supabase Storage (sin CORS,
    //    IP residencial) → el server lo baja de ahí y lo sube a Drive (sin CORS). Antes
    //    se usaba browser→Drive directo, que SIEMPRE fallaba por el header Location (CORS).
    if (isVideo) {
      try {
        onProgress?.("Guardando el video…");
        const supaUrl = await uploadVideoBlob(file);   // preview estable (no expira)
        onProgress?.("Respaldando a Drive…");
        const { url: driveUrl } = await driveBackupFromUrl(supaUrl, {
          marca: data.suggested_labels?.marca?.[0] || null,
          format: data.suggested_format || null,
          stage: data.suggested_stage || null,
        });
        // Siempre queda un respaldo: Drive si se pudo, si no la copia de Supabase.
        const backup = driveUrl || supaUrl;
        updated = await updateInboxItem(item.id, {
          video_backup_url: backup,
          source_url: backup,
          ai_raw: { ...(updated.ai_raw || {}), video_url: supaUrl },   // video estable para re-análisis
        });
      } catch { /* el respaldo es un extra, no bloquea el análisis */ }
    }

    return { item: updated };
  } catch (e) {
    await setInboxStatus(item.id, "pending");
    throw e;
  }
}

// Calcula el próximo order_index dentro del bucket (stage+format) de un board.
async function nextOrderIndex(boardId, stage, format) {
  const { data } = await database
    .from("despliegue_concepts")
    .select("order_index")
    .eq("board_id", boardId)
    .eq("stage", stage)
    .eq("format", format)
    .eq("archived", false)
    .order("order_index", { ascending: false })
    .limit(1);
  return data?.[0]?.order_index != null ? data[0].order_index + 1 : 0;
}

// ───── Importar desde documento (identificar → revisar → cargar por tandas) ──
const NEW_CONCEPT_RE = /\bnuevo\s+(concepto|formato)\b/i;

// Parte el texto en secciones: una línea que NO es URL = encabezado; las URLs que
// siguen = sus links. Ignora vacías. Pura (sin DB).
export function parseDocumentSections(text) {
  const isUrl = (l) => /^https?:\/\//i.test((l || "").trim());
  const out = [];
  let cur = null;
  for (const raw of (text || "").split(/\r?\n/)) {
    const l = raw.trim();
    if (!l) continue;
    if (isUrl(l)) { if (cur) cur.urls.push(l); }
    else { cur = { header: l, urls: [] }; out.push(cur); }
  }
  return out.filter((s) => s.urls.length);
}

// IDENTIFICA (sin escribir DB): parsea, normaliza los encabezados con IA, matchea
// contra los conceptos existentes y detecta "nuevo concepto/formato". Devuelve rows
// editables para el preview.
export async function identifyDocument(text, { pipelineType = "ads" } = {}) {
  const sections = parseDocumentSections(text);
  if (!sections.length) return { rows: [], concepts: [] };

  const existing = (await listBankConcepts()).filter((c) => (c.pipeline_type || "ads") === pipelineType);
  const byName = new Map(existing.map((c) => [(c.name || "").toLowerCase(), c]));

  let parsed = [];
  try {
    const resp = await fetch("/api/classify-ad", {
      method: "POST", headers: await buildApiHeaders(),
      body: JSON.stringify({ mode: "parse_headers", headers: sections.map((s) => s.header), knownConcepts: existing.map((c) => c.name) }),
    });
    const data = await resp.json();
    if (resp.ok && Array.isArray(data.headers)) parsed = data.headers;
  } catch { /* si falla, usamos el encabezado tal cual */ }
  const byHeader = new Map(parsed.map((p) => [p.header, p]));

  const rows = sections.map((s) => {
    const p = byHeader.get(s.header) || {};
    const forceNew = NEW_CONCEPT_RE.test(s.header);
    const rawName = (p.concept || s.header).replace(NEW_CONCEPT_RE, "").trim() || "Sin nombre";
    const stage = ["tofu", "mofu", "bofu"].includes((p.stage || "").toLowerCase()) ? p.stage.toLowerCase() : "tofu";
    const media = p.media === "static" ? "static" : "video";
    const subConcept = (p.subConcept || "").trim();
    const match = forceNew ? null : byName.get(rawName.toLowerCase());
    return {
      header: s.header, urls: s.urls, count: s.urls.length,
      concept: match ? match.name : rawName,
      matchedConceptId: match ? match.id : null,
      isNew: !match,
      stage: match ? (match.stage || stage) : stage,
      media, subConcept,
      imported: false,
    };
  });
  return { rows, concepts: existing.map((c) => ({ id: c.id, name: c.name, stage: c.stage })) };
}

// IMPORTA las secciones (rows) elegidas: resuelve/crea el concepto, crea los inbox
// items ASIGNADOS y devuelve { created, perRow } para encolar el análisis.
export async function importSections(rows, { companyId = BANK_REFS_COMPANY_ID, pipelineType = "ads" } = {}) {
  const board = await getOrCreateBoard(companyId, pipelineType);
  const uid = await currentUserId();
  const { data: existingInbox } = await database.from(TABLE).select("source_url").eq("company_id", companyId);
  const seen = new Set((existingInbox || []).map((r) => r.source_url));

  const allRowsCreated = [];   // items creados (para encolar)
  const perRow = [];           // {header, conceptId, created, skipped}
  for (const r of (rows || [])) {
    const conceptName = (r.concept || "Sin nombre").trim();
    const stage = ["tofu", "mofu", "bofu"].includes((r.stage || "").toLowerCase()) ? r.stage.toLowerCase() : "tofu";
    const media = r.media === "static" ? "static" : "video";
    let cid = r.matchedConceptId || null;
    if (!cid) {
      const order_index = await nextOrderIndex(board.id, stage, media);
      const concept = await createConcept({ board_id: board.id, stage, format: media, name: conceptName, order_index });
      cid = concept.id;
    }
    const toInsert = [];
    for (const url of r.urls) {
      if (seen.has(url)) continue;
      seen.add(url);
      toInsert.push({
        source_url: url, source_platform: "meta", status: "pending",
        company_id: companyId, pipeline_type: pipelineType, created_by: uid, source_kind: "manual",
        target_concept_id: cid, suggested_format: conceptName, suggested_stage: stage, suggested_media_type: media,
        suggested_labels: r.subConcept ? { formato: [r.subConcept] } : {},
      });
    }
    let created = [];
    if (toInsert.length) {
      const { data, error } = await database.from(TABLE).insert(toInsert).select();
      if (error) throw error;
      created = data || [];
    }
    allRowsCreated.push(...created);
    perRow.push({ header: r.header, conceptId: cid, created: created.length, skipped: r.urls.length - toInsert.length });
  }
  return { created: allRowsCreated, perRow };
}

// Consigue el link de respaldo de Drive de un item: si ya lo tiene, lo devuelve;
// si no lo tiene pero hay un video (de Foreplay), lo genera on-demand al cargar
// al banco (baja el video → sube a Drive). Best-effort (null si no se puede).
// Respalda a Drive un video accesible por URL: el SERVER lo baja (Supabase/Drive
// directo; fbcdn con reintentos+proxy) y lo sube a Drive. Devuelve el link o null.
// Timeout duro para no colgar nunca la UI.
export async function driveBackupFromUrl(videoUrl, { marca = null, format = null, stage = null } = {}) {
  if (!videoUrl) return { url: null, reason: "sin videoUrl" };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 120000);
  try {
    const resp = await fetch("/api/drive-backup", {
      method: "POST", headers: await buildApiHeaders(), signal: ctrl.signal,
      body: JSON.stringify({ videoUrl, marca, format, stage }),
    });
    const data = await resp.json();
    return { url: data?.drive_url || null, reason: data?.reason || null };
  } catch (e) { return { url: null, reason: e?.message || "timeout" }; }
  finally { clearTimeout(t); }
}

async function ensureDriveBackup(item) {
  if (item.video_backup_url) return item.video_backup_url;
  const videoUrl = item.ai_raw?.video_url;
  if (!videoUrl) return null;
  const { url } = await driveBackupFromUrl(videoUrl, {
    marca: item.suggested_labels?.marca?.[0] || null,
    format: item.suggested_format || null,
    stage: item.suggested_stage || null,
  });
  return url;
}

const adIdOfUrl = (u) => { const m = (u || "").match(/[?&]id=(\d{5,})/); return m ? m[1] : null; };

// Respalda a Drive variaciones del BANCO que no tienen `drive_url`. Como la variación
// no guarda la URL del video (solo el link de Meta), re-busca el video por Apify
// (marca de bank_labels + ad_id) y lo sube a Drive, seteando `drive_url` en la variación.
// Devuelve { done, failed, noVideo, total, brands }. onProgress(msg).
export async function backupBankVariationsToDrive(variations, { concept = null, extraBrands = [], onProgress = null } = {}) {
  const targets = (variations || []).filter((v) => !v.drive_url && (v.meta_ad_id || v.meta_ads_library_url));
  if (!targets.length) return { done: 0, failed: 0, noVideo: 0, total: 0, brands: 0 };

  // Marcas a scrapear = las de las variaciones (+ extras a mano).
  const brandSet = new Map();
  const push = (b) => { const s = (b || "").trim(); if (s && s.length >= 2 && !brandSet.has(s.toLowerCase())) brandSet.set(s.toLowerCase(), s); };
  for (const v of targets) push(v.bank_labels?.marca?.[0]);
  for (const b of extraBrands) push(b);
  const brands = [...brandSet.values()];
  if (!brands.length) return { done: 0, failed: 0, noVideo: targets.length, total: targets.length, brands: 0, reason: "Las variaciones no tienen marca. Agregala a mano." };

  // Scrapea cada marca → mapa ad_id → resultado (con y sin video, para diagnosticar).
  const map = new Map();       // ad_id → result con video
  const seenIds = new Set();   // todo ad_id visto en el scrape (con o sin video)
  let bi = 0, scrapedTotal = 0, scrapedWithVideo = 0, apifyReason = null;
  for (const b of brands) {
    onProgress?.(`Buscando ${b} en Meta (${++bi}/${brands.length})…`);
    try {
      const data = await apifyScrapeBrand(b, { count: 300 });
      if (data?.ok === false && data.reason) apifyReason = data.reason;   // p.ej. "Apify status 403..."
      for (const r of (data.results || [])) {
        if (!r.ad_id) continue;
        scrapedTotal++; seenIds.add(String(r.ad_id));
        if (r.video_url) { scrapedWithVideo++; map.set(String(r.ad_id), r); }
      }
    } catch (e) { apifyReason = e?.message || String(e); }
  }

  let done = 0, failed = 0, noAdId = 0, notInMeta = 0, foundNoVideo = 0, i = 0;
  let dlFail = 0, saveFail = 0, backupReason = null, saveReason = null;
  for (const v of targets) {
    onProgress?.(`Respaldando ${++i}/${targets.length}…`);
    const adId = String(v.meta_ad_id || adIdOfUrl(v.meta_ads_library_url) || "");
    if (!adId) { noAdId++; continue; }                     // sin id → no re-buscable
    const r = map.get(adId);
    if (!r?.video_url) { if (seenIds.has(adId)) foundNoVideo++; else notInMeta++; continue; }
    const { url: link, reason } = await driveBackupFromUrl(r.video_url, {
      marca: v.bank_labels?.marca?.[0] || null,
      format: v.concept_name || concept?.name || v.bank_labels?.formato?.[0] || null,
      stage: v.concept_stage || concept?.stage || null,
    });
    if (link) {
      try { await updateVariation(v.id, { drive_url: link }); done++; }
      catch (e) { failed++; saveFail++; if (!saveReason) saveReason = e?.message || String(e); }   // Drive OK pero no se guardó
    } else { failed++; dlFail++; if (reason) backupReason = reason; }   // no se pudo bajar/subir a Drive
  }
  const noVideo = noAdId + notInMeta + foundNoVideo;
  // Motivo agregado: distingue "no se pudo respaldar a Drive" vs "Drive OK pero no se guardó en el banco".
  const combinedReason = [
    dlFail && backupReason ? `Respaldo a Drive falló (${dlFail}): ${backupReason}` : null,
    saveFail && saveReason ? `Drive OK pero no se guardó en el banco (${saveFail}): ${saveReason}` : null,
  ].filter(Boolean).join(" · ") || null;
  return { done, failed, noVideo, noAdId, notInMeta, foundNoVideo, dlFail, saveFail, total: targets.length, brands: brands.length, scrapedTotal, scrapedWithVideo, apifyReason, backupReason: combinedReason };
}

// Respalda a Drive TODAS las variaciones del banco sin `drive_url` (con link de
// Meta), de todos los conceptos de una. Agrupa por marca → una corrida de Apify por
// marca cubre todos sus anuncios. onProgress(msg). Devuelve el mismo desglose.
export async function backupAllMissingDrive(pipelineType = "ads", onProgress = null) {
  onProgress?.("Buscando referencias sin respaldo…");
  const all = await listBankVariations(pipelineType);
  const targets = (all || []).filter((v) => !v.drive_url && (v.meta_ad_id || v.meta_ads_library_url));
  if (!targets.length) return { done: 0, failed: 0, noVideo: 0, total: 0, brands: 0, scrapedTotal: 0, scrapedWithVideo: 0 };
  return backupBankVariationsToDrive(targets, { onProgress });
}

// Respalda a Drive en lote los ítems que tienen un video (ai_raw.video_url) pero no
// `video_backup_url`. Devuelve { done, failed }. onProgress(i, total, item).
export async function backupItemsToDrive(items, onProgress = null) {
  const targets = (items || []).filter((it) => !it.video_backup_url && it.ai_raw?.video_url);
  let done = 0, failed = 0, i = 0;
  for (const it of targets) {
    onProgress?.(++i, targets.length, it);
    const { url: link } = await driveBackupFromUrl(it.ai_raw.video_url, {
      marca: it.suggested_labels?.marca?.[0] || null,
      format: it.suggested_format || null,
      stage: it.suggested_stage || null,
    });
    if (link) {
      try {
        await updateInboxItem(it.id, { video_backup_url: link });
        // Si ya está cargado al banco, propagamos el link a la variación también.
        if (it.resulting_variation_id) { try { await updateVariation(it.resulting_variation_id, { drive_url: link }); } catch { /* no bloquea */ } }
        done++;
      } catch { failed++; }
    } else failed++;
  }
  return { done, failed, total: targets.length };
}

// Carga un item de la bandeja al Banco de creativos.
//   mode = 'new'      → crea un formato (concept) nuevo + su primera referencia.
//   mode = 'existing' → agrega la referencia a un concepto ya existente (targetConceptId).
// Reusa getOrCreateBoard/createConcept/createVariation ya probados por el banco.
// Al terminar marca el item como 'imported' y guarda los ids resultantes.
// Las portadas que llegan de Foreplay o Apify apuntan al servidor de ellos. Las de
// Meta caducan en días y quedan rotas para siempre; las de Foreplay hoy funcionan
// pero tampoco son nuestras. Al importar al banco nos quedamos con una copia en
// Storage, que es lo único que no se nos cae después.
//
// Mejor esfuerzo: si la descarga falla (CORS, 403, host caído) se conserva la URL
// original — es preferible una portada dudosa a ninguna.
async function rehostCover(url) {
  const u = (url || "").trim();
  if (!u || isOwnStorage(u)) return u || null;
  try {
    const resp = await fetch(u);
    if (!resp.ok) return u;
    const blob = await resp.blob();
    if (!blob.size || !/^image\//.test(blob.type || "")) return u;
    return await uploadCoverBlob(blob, { prefix: "bank-covers" });
  } catch {
    return u;
  }
}

export async function commitInboxItem(item, { mode = "new", targetConceptId = null, skipDrive = false } = {}) {
  if (!item?.id) throw new Error("Item inválido");
  await ensureFreshSession();   // evita que la escritura salga sin token (sesión vencida → RLS)

  const stage = item.suggested_stage || "tofu";
  const mediaType = item.suggested_media_type || "video";
  let conceptId = targetConceptId;

  if (mode === "new") {
    if (!item.suggested_format?.trim() && !item.suggested_name?.trim()) {
      throw new Error("Poné al menos el nombre del formato antes de cargarlo.");
    }
    const companyId = item.company_id || BANK_REFS_COMPANY_ID;
    const board = await getOrCreateBoard(companyId, item.pipeline_type || "ads");
    const order_index = await nextOrderIndex(board.id, stage, mediaType);
    const concept = await createConcept({
      board_id: board.id,
      stage,
      format: mediaType,
      name: (item.suggested_format || item.suggested_name).trim(),
      description: item.suggested_description?.trim() || null,
      order_index,
    });
    conceptId = concept.id;
  } else {
    if (!conceptId) throw new Error("Elegí un formato existente para agregar la referencia.");
  }

  // El respaldo a Drive NO debe bloquear la carga (baja el video → puede tardar/colgar).
  // En carga masiva se omite (skipDrive) y se usa el respaldo ya existente si lo hay.
  const driveUrl = skipDrive ? (item.video_backup_url || null) : await ensureDriveBackup(item);
  const variation = await createVariation({
    concept_id: conceptId,
    label: "Ref",
    name: item.suggested_name?.trim() || null,
    state: "produced",
    file_url: await rehostCover(item.cover_url),
    drive_url: driveUrl,
    meta_ad_id: item.ai_raw?.external_id || adIdFromMetaUrl(item.source_url) || null,  // clave estable para dedup + reparación
    meta_ads_library_url: item.source_url || null,
    bank_labels: item.suggested_labels || {},
    transcript: item.transcript || null,
    notes: item.suggested_description?.trim() || null,   // "cómo está hecho" — antes se perdía
  });

  const updated = await updateInboxItem(item.id, {
    status: "imported",
    resulting_concept_id: conceptId,
    resulting_variation_id: variation.id,
    ...(driveUrl && !item.video_backup_url ? { video_backup_url: driveUrl } : {}),
  });
  return { item: updated, conceptId, variationId: variation.id };
}

// ¿Se puede cargar este item automáticamente (sin abrir el modal)? Necesita o
// un concepto destino matcheado, o al menos un nombre de formato/anuncio.
export function canAutoCommit(item) {
  return !!(item?.target_concept_id || item?.suggested_format?.trim() || item?.suggested_name?.trim());
}

// Carga VARIOS items al banco de una. Es "inteligente":
//  • Los que ya matchearon un concepto existente (target_concept_id) → se
//    agregan a ese concepto.
//  • Los que NO matchearon se AGRUPAN por (empresa, pipeline, etapa, tipo,
//    nombre de formato) y se crea UN concepto por grupo — así 20 referentes
//    "UGC/TOFU/Video" de la misma empresa quedan en UN solo formato, no en 20
//    conceptos duplicados.
//  • Los que no tienen ni concepto ni nombre de formato se omiten (hay que
//    analizarlos/editarlos primero).
// Devuelve { committed, skipped, conceptsCreated, errors[] }.
export async function commitInboxItemsBulk(items = [], onProgress = null) {
  await ensureFreshSession();   // una sola verificación de sesión para toda la tanda
  const out = { committed: 0, skipped: 0, conceptsCreated: 0, errors: [], backedUp: 0 };
  const usable = (items || []).filter((it) => it && it.status !== "imported");

  const withTarget = usable.filter((it) => it.target_concept_id);
  const needNew = usable.filter((it) => !it.target_concept_id && (it.suggested_format?.trim() || it.suggested_name?.trim()));
  out.skipped += usable.length - withTarget.length - needNew.length;

  // 0) PRE-RESPALDO (crítico): los que tienen video (ai_raw.video_url) pero no
  //    `video_backup_url` se respaldan AHORA a Storage estable. Si no, el video de
  //    fbcdn (que se ve en el feed pero es temporal) EXPIRA y la referencia queda
  //    sin video en el banco. Se hace en paralelo para no colgar la carga.
  const needBackup = usable.filter((it) => !it.video_backup_url && it.ai_raw?.video_url);
  const backupMap = new Map();
  if (needBackup.length) {
    let bdone = 0;
    await parallelPool(needBackup, 3, async (it) => {
      onProgress?.(`Respaldando video ${++bdone}/${needBackup.length}…`);
      try {
        const { url } = await driveBackupFromUrl(it.ai_raw.video_url, {
          marca: it.suggested_labels?.marca?.[0] || null,
          format: it.suggested_format || null,
          stage: it.suggested_stage || null,
        });
        if (url) { backupMap.set(it.id, url); out.backedUp++; try { await updateInboxItem(it.id, { video_backup_url: url }); } catch { /* no bloquea */ } }
      } catch { /* si falla, sigue sin respaldo (mejor que colgar) */ }
    });
  }
  // Respaldo efectivo de un item (el que ya tenía, o el recién hecho).
  const bk = (it) => it.video_backup_url || backupMap.get(it.id) || null;

  // 1) Los que ya tienen concepto destino → agregar directo (con el respaldo ya hecho).
  for (const it of withTarget) {
    try {
      await commitInboxItem({ ...it, video_backup_url: bk(it) }, { mode: "existing", targetConceptId: it.target_concept_id, skipDrive: true });
      out.committed++;
    } catch (e) { out.errors.push(`${it.suggested_name || it.source_url}: ${e?.message || e}`); }
  }

  // 2) Los nuevos → agrupar por formato y crear un concepto por grupo.
  const groups = new Map();
  for (const it of needNew) {
    const company = it.company_id || BANK_REFS_COMPANY_ID;
    const pipeline = it.pipeline_type || "ads";
    const stage = it.suggested_stage || "tofu";
    const media = it.suggested_media_type || "video";
    const name = (it.suggested_format || it.suggested_name).trim();
    const key = `${company}|${pipeline}|${stage}|${media}|${name.toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, { company, pipeline, stage, media, name, items: [] });
    groups.get(key).items.push(it);
  }
  for (const g of groups.values()) {
    try {
      const board = await getOrCreateBoard(g.company, g.pipeline);
      const order_index = await nextOrderIndex(board.id, g.stage, g.media);
      const concept = await createConcept({
        board_id: board.id, stage: g.stage, format: g.media, name: g.name,
        description: g.items[0].suggested_description?.trim() || null, order_index,
      });
      out.conceptsCreated++;
      for (const it of g.items) {
        try {
          const driveUrl = bk(it);   // respaldo ya hecho en el pre-paso (video estable)
          const variation = await createVariation({
            concept_id: concept.id, label: "Ref", name: it.suggested_name?.trim() || null,
            state: "produced", file_url: await rehostCover(it.cover_url), drive_url: driveUrl,
            meta_ad_id: it.ai_raw?.external_id || adIdFromMetaUrl(it.source_url) || null,  // clave estable para dedup + reparación
            meta_ads_library_url: it.source_url || null, bank_labels: it.suggested_labels || {},
            transcript: it.transcript || null,
            notes: it.suggested_description?.trim() || null,   // "cómo está hecho" — antes se perdía
          });
          await updateInboxItem(it.id, { status: "imported", resulting_concept_id: concept.id, resulting_variation_id: variation.id, ...(driveUrl && !it.video_backup_url ? { video_backup_url: driveUrl } : {}) });
          out.committed++;
        } catch (e) { out.errors.push(`${it.suggested_name || it.source_url}: ${e?.message || e}`); }
      }
    } catch (e) { out.errors.push(`Formato "${g.name}": ${e?.message || e}`); }
  }
  return out;
}

// ───── Devolver variaciones del Banco a la Bandeja (para re-analizarlas) ──────
// Anuncios que entraron al banco "a medias" (solo el link de Meta, sin portada/
// transcripción/etiquetas) se MUEVEN de vuelta a la Bandeja: crea un item de inbox
// (invirtiendo el mapeo de commitInboxItem) asignado al MISMO concepto, y borra la
// variación pelada del banco. Si tenía drive_url se preserva como video_backup_url.
//   variations: filas de despliegue_variations (con meta_ads_library_url, file_url,
//     bank_labels, transcript, drive_url, name).
//   concept: { id, name, stage, format, company_id, pipeline_type } del concepto abierto.
// Devuelve { returned, skipped, deleted }.
export async function returnVariationsToInbox(variations, concept) {
  const list = (variations || []).filter((v) => v?.meta_ads_library_url);
  const skipped = (variations || []).length - list.length;   // sin link de Meta → no se puede re-analizar
  if (!list.length) return { returned: 0, skipped, deleted: 0 };

  // Dedup contra lo que ya está en la bandeja (por si se devolvió antes). En lotes,
  // como importForeplayAds, para no pasar el límite de longitud de la URL de PostgREST.
  const urls = [...new Set(list.map((v) => v.meta_ads_library_url))];
  const seen = new Set();
  for (let i = 0; i < urls.length; i += 80) {
    const batch = urls.slice(i, i + 80);
    const { data: existing, error } = await database.from(TABLE).select("source_url").in("source_url", batch);
    if (error) throw error;
    for (const r of existing || []) seen.add(r.source_url);
  }

  const uid = await currentUserId();
  const stage = ["tofu", "mofu", "bofu"].includes((concept?.stage || "").toLowerCase()) ? concept.stage.toLowerCase() : "tofu";
  const media = concept?.format === "static" ? "static" : "video";
  const fresh = [];
  const freshVarIds = [];
  const usedUrl = new Set();
  for (const v of list) {
    const url = v.meta_ads_library_url;
    if (seen.has(url) || usedUrl.has(url)) continue;   // ya en bandeja o duplicado en el lote
    usedUrl.add(url);
    freshVarIds.push(v.id);
    fresh.push({
      source_url: url,
      source_platform: "meta",
      source_kind: "manual",
      status: "pending",
      company_id: concept?.company_id || BANK_REFS_COMPANY_ID,
      pipeline_type: concept?.pipeline_type || "ads",
      created_by: uid,
      target_concept_id: concept?.id || null,
      suggested_format: concept?.name || null,
      suggested_stage: stage,
      suggested_media_type: media,
      suggested_name: v.name || null,
      suggested_labels: v.bank_labels || {},
      cover_url: v.file_url || null,
      transcript: v.transcript || null,
      video_backup_url: v.drive_url || null,
      // Sin video propio (drive) → marcamos faltan-video para que 🎬 Traer videos (Apify)
      // lo tome directo y lo complete matcheando por id con la marca de bank_labels.
      ai_raw: { needs_file: !v.drive_url, returned_from_bank: true },
    });
  }
  if (!fresh.length) return { returned: 0, skipped, deleted: 0 };

  const { error: insErr } = await database.from(TABLE).insert(fresh);
  if (insErr) throw insErr;

  // Solo borramos del banco las que sí se insertaron (las dedup-eadas se quedan como
  // estaban para no perder su lugar, aunque ya había una copia en bandeja).
  let deleted = 0;
  try { const r = await deleteVariationsBulk(freshVarIds); deleted = r?.count ?? freshVarIds.length; }
  catch { /* si el borrado falla, el item igual quedó en bandeja (mejor dup que perderlo) */ }

  return { returned: fresh.length, skipped, deleted };
}

// ───── Backfill: rellenar `notes` de variaciones ya cargadas ─────────────────
// Los ítems 'imported' guardaron la descripción de la IA en `suggested_description`,
// pero (por un bug de mapeo) NO se copió al `notes` de la variación. Esto lo repara
// sin re-analizar: por cada item imported con descripción y variación resultante,
// escribe `notes` en la variación SI está vacía (no pisa lo que Jose editó a mano).
// Devuelve { filled, checked }.
export async function backfillVariationNotes() {
  const { data: items, error } = await database
    .from(TABLE)
    .select("id, suggested_description, resulting_variation_id")
    .eq("status", "imported")
    .not("resulting_variation_id", "is", null)
    .not("suggested_description", "is", null);
  if (error) throw error;
  const rows = (items || []).filter((it) => (it.suggested_description || "").trim());
  if (!rows.length) return { filled: 0, checked: 0 };

  // Traé el `notes` actual de esas variaciones (en lotes) para no pisar las llenas.
  const varIds = [...new Set(rows.map((r) => r.resulting_variation_id))];
  const emptyNotes = new Set();
  for (let i = 0; i < varIds.length; i += 100) {
    const batch = varIds.slice(i, i + 100);
    const { data: vars, error: vErr } = await database
      .from("despliegue_variations").select("id, notes").in("id", batch);
    if (vErr) throw vErr;
    for (const v of vars || []) if (!(v.notes && v.notes.trim())) emptyNotes.add(v.id);
  }

  let filled = 0;
  for (const it of rows) {
    if (!emptyNotes.has(it.resulting_variation_id)) continue;
    emptyNotes.delete(it.resulting_variation_id);   // una sola vez por variación
    try { await updateVariation(it.resulting_variation_id, { notes: it.suggested_description.trim() }); filled++; }
    catch { /* sigue con las demás */ }
  }
  return { filled, checked: varIds.length };
}

// ───── Detección de DUPLICADOS (multi-señal) ─────────────────────────────────
// El mismo anuncio ganador suele venir como muchas "instancias" con ids distintos.
// No alcanza con la portada (varios subtítulos = mismo frame): comparamos por
// VARIAS señales fuertes y agrupamos por componentes conexos (si comparten
// CUALQUIERA → mismo creativo). Señales: id de anuncio de Meta, nombre de archivo
// del video, nombre de archivo de la portada, transcripción normalizada, y la URL
// fuente exacta. Todas son muy únicas por creativo, así que casi no dan falsos +.

// Basenames genéricos que NO identifican un archivo (los usan Drive y otros) →
// nunca deben ser clave (si no, todo lo de Drive colapsa en una sola clave).
const GENERIC_BASENAMES = new Set(["uc", "view", "preview", "edit", "open", "download", "index"]);

// Identificador estable de un asset por su URL. Para links de Google Drive usa el
// ID del archivo (único) — el pathname es genérico (/uc, /view…) y colapsaría todo.
// Para el resto, el nombre de archivo (basename), descartando basenames genéricos.
function urlFileKey(u) {
  if (!u || typeof u !== "string") return null;
  // Google Drive: el ID es lo único que identifica el archivo.
  if (/drive\.google\.com|docs\.google\.com/i.test(u)) {
    const m = u.match(/\/d\/([\w-]{20,})|[?&]id=([\w-]{20,})/);
    return m ? `drive:${m[1] || m[2]}` : null;   // sin id extraíble → sin clave (no colapsar)
  }
  let base;
  try { base = new URL(u).pathname.split("/").pop(); }
  catch { base = u.split("?")[0].split("/").pop(); }
  base = (base || "").toLowerCase().trim();
  if (base.length < 6) return null;                          // basenames triviales
  if (GENERIC_BASENAMES.has(base.replace(/\.[a-z0-9]+$/, ""))) return null;
  return base;
}
const metaIdOfUrl = (u) => { const m = (u || "").match(/[?&]id=(\d{5,})/); return m ? m[1] : null; };

// Claves fuertes de un item de la bandeja. Solo IDENTIDAD DE ASSET (id de anuncio,
// archivo de video, archivo de portada, URL fuente). NO usamos la transcripción:
// los videos de música/edit comparten la misma canción de fondo → misma
// transcripción → generaba falsos positivos (unía creativos distintos).
function inboxDupKeys(it) {
  const keys = [];
  const adId = it.ai_raw?.external_id || metaIdOfUrl(it.source_url);
  if (adId) keys.push(`ad:${adId}`);
  const vk = urlFileKey(it.ai_raw?.video_url) || urlFileKey(it.video_backup_url);
  if (vk) keys.push(`vid:${vk}`);
  const ck = urlFileKey(it.cover_url);
  if (ck) keys.push(`cov:${ck}`);
  if (it.source_url && !/^upload:/i.test(it.source_url)) keys.push(`src:${it.source_url.toLowerCase()}`);
  return keys;
}
// Claves fuertes de una variación del banco (misma lógica de identidad de asset).
function bankDupKeys(v) {
  const keys = [];
  const adId = v.meta_ad_id || metaIdOfUrl(v.meta_ads_library_url);
  if (adId) keys.push(`ad:${adId}`);
  const vk = urlFileKey(v.drive_url);
  if (vk) keys.push(`vid:${vk}`);
  const ck = urlFileKey(v.file_url);
  if (ck) keys.push(`cov:${ck}`);
  if (v.meta_ads_library_url) keys.push(`src:${v.meta_ads_library_url.toLowerCase()}`);
  return keys;
}

// Agrupa por componentes conexos (union-find) usando keyFn(row)→claves.
// Devuelve solo grupos con >1 elemento. Cada row debe tener `id`.
function groupByFingerprint(rows, keyFn) {
  const parent = new Map();
  const find = (x) => { let r = x; while (parent.get(r) !== r) r = parent.get(r); while (parent.get(x) !== r) { const n = parent.get(x); parent.set(x, r); x = n; } return r; };
  const ensure = (k) => { if (!parent.has(k)) parent.set(k, k); };
  const union = (a, b) => { ensure(a); ensure(b); parent.set(find(a), find(b)); };
  for (const row of rows) {
    const anchor = `row:${row.id}`;
    ensure(anchor);
    for (const k of keyFn(row)) union(anchor, k);
  }
  const groups = new Map();
  for (const row of rows) {
    const root = find(`row:${row.id}`);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(row);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

// Puntaje de "cuál conservar" en la bandeja: más completo + mejor estado gana.
const INBOX_STATUS_RANK = { imported: 5, approved: 4, ready: 3, enriching: 2, pending: 1, rejected: 0 };
function inboxKeepScore(it) {
  let s = (INBOX_STATUS_RANK[it.status] ?? 0) * 10;
  if (it.transcript && it.transcript.trim()) s += 4;
  if (it.cover_url) s += 2;
  if (it.ai_raw?.video_url || it.video_backup_url) s += 2;
  if (it.video_backup_url) s += 1;
  if (it.suggested_format || it.suggested_name) s += 1;
  return s;
}
function bankKeepScore(v) {
  let s = 0;
  if (v.drive_url) s += 4;
  if (v.transcript && v.transcript.trim()) s += 3;
  if (v.file_url) s += 2;
  if (v.notes && v.notes.trim()) s += 1;
  return s;
}

// Encuentra grupos de duplicados en la BANDEJA (todos los estados que le pases).
// Cada grupo: { items:[ordenados, mejor primero], keepId, removeIds }.
export function findInboxDuplicates(items = []) {
  return groupByFingerprint(items, inboxDupKeys).map((g) => {
    const sorted = [...g].sort((a, b) => bkTie(inboxKeepScore(b), inboxKeepScore(a), a, b));
    return { items: sorted, keepId: sorted[0].id, removeIds: sorted.slice(1).map((x) => x.id) };
  }).sort((a, b) => b.items.length - a.items.length);
}
// Desempate estable: mayor score primero; a igualdad, el más viejo (created_at asc).
function bkTie(scoreB, scoreA, a, b) {
  if (scoreB !== scoreA) return scoreB - scoreA;
  return (a.created_at || "") < (b.created_at || "") ? -1 : 1;
}

// Encuentra grupos de duplicados en el BANCO (variaciones de un pipeline).
// Devuelve { groups, variations } — groups con keep/remove, variations = plano usado.
export async function findBankDuplicates(pipelineType = "ads") {
  const variations = await listBankVariations(pipelineType);
  const groups = groupByFingerprint(variations, bankDupKeys).map((g) => {
    const sorted = [...g].sort((a, b) => bkTie(bankKeepScore(b), bankKeepScore(a), a, b));
    return { items: sorted, keepId: sorted[0].id, removeIds: sorted.slice(1).map((x) => x.id) };
  }).sort((a, b) => b.items.length - a.items.length);
  return { groups, variations };
}

// Borra variaciones duplicadas del banco (reusa el borrado en lote del banco).
export async function deleteBankVariations(ids = []) {
  if (!ids.length) return { count: 0 };
  const r = await deleteVariationsBulk(ids);
  return { count: r?.count ?? ids.length };
}
