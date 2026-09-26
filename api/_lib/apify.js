// Scraper de la Biblioteca de Anuncios de Meta vía Apify.
//
// Meta bloquea el fetch directo (403) y los proxies genéricos no pasan su
// login-wall / SPA. El actor de Apify sí resuelve la SPA y devuelve JSON limpio.
//
// Vive acá y no dentro del handler porque lo usan dos: `api/apify-ad.js` (que
// llama el navegador) y el worker de la cola, que scrapea sin nadie mirando.
//
// Solo servidor: usa APIFY_TOKEN. No importar desde `src/`.

export const DEFAULT_ACTOR = "curious_coder~facebook-ads-library-scraper";
// run-sync bloquea hasta que el run termina; lo acotamos para no pasar el maxDuration.
export const RUN_TIMEOUT_SECS = 230;

// ── Normalización de entrada ──────────────────────────────────────────────
export function adIdFromUrl(u) {
  if (!u) return null;
  const s = String(u);
  const m = s.match(/[?&]id=(\d{5,})/) || s.match(/\/(\d{8,})(?:\/|$|\?)/);
  return m ? m[1] : (/^\d{5,}$/.test(s.trim()) ? s.trim() : null);
}

export function toAdUrl(idOrUrl) {
  const s = String(idOrUrl).trim();
  if (/^https?:\/\//i.test(s)) return s;
  return `https://www.facebook.com/ads/library/?id=${s}`;
}

/**
 * URL de búsqueda por palabra clave.
 *
 * Existe acá y no repetida en cada llamador porque ya se rompió una vez: al
 * reconstruirla en el worker se cayó `media_type=all` y Meta devolvió anuncios
 * de otra marca. Un parámetro de menos y la búsqueda trae cualquier cosa.
 */
export function urlDeBusqueda(marca) {
  return `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&q=${encodeURIComponent(marca)}&search_type=keyword_unordered&media_type=all`;
}

/** URL de la Ad Library filtrada por página: todos los anuncios de esa marca, exacto. */
export function urlDePagina(pageId) {
  return `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&view_all_page_id=${encodeURIComponent(pageId)}`;
}

// ── Extracción robusta desde el JSON del actor (walk profundo por si cambia la forma) ──
export function deepFindUrl(obj, keyRe, seen = new Set()) {
  if (!obj || typeof obj !== "object" || seen.has(obj)) return null;
  seen.add(obj);
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string" && keyRe.test(k) && /^https?:\/\//.test(v)) return v;
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") {
      const found = deepFindUrl(v, keyRe, seen);
      if (found) return found;
    }
  }
  return null;
}

export function deepFindText(obj, keyRe, seen = new Set()) {
  if (!obj || typeof obj !== "object" || seen.has(obj)) return null;
  seen.add(obj);
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string" && keyRe.test(k) && v.trim().length > 1) return v.trim();
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") {
      const found = deepFindText(v, keyRe, seen);
      if (found) return found;
    }
  }
  return null;
}

export function parseItem(item) {
  const snap = item.snapshot || item.snapshotData || item;
  const ad_id =
    item.ad_archive_id || item.adArchiveID || item.adArchiveId || item.ad_id ||
    snap.ad_archive_id || adIdFromUrl(item.url || item.ad_snapshot_url || "") || null;
  const page_name =
    item.page_name || snap.page_name || snap.current_page_name || item.pageName ||
    deepFindText(item, /^(page_name|current_page_name|pageName)$/) || null;
  const video_url =
    deepFindUrl(snap, /video_hd_url/) || deepFindUrl(snap, /video_sd_url/) ||
    deepFindUrl(item, /video_(hd|sd)_url/) || null;
  const image_url =
    deepFindUrl(snap, /original_image_url/) || deepFindUrl(snap, /resized_image_url/) ||
    deepFindUrl(snap, /video_preview_image_url/) || deepFindUrl(item, /(original_image|preview_image)_url/) || null;
  const body =
    (snap.body && (snap.body.text || (typeof snap.body === "string" ? snap.body : null))) ||
    deepFindText(snap, /^(body|link_description|caption)$/) || null;
  const title = snap.title || snap.caption || deepFindText(snap, /^title$/) || null;
  // Señales de "ganador": Meta no da impresiones de anuncios comerciales, pero sí
  // la antigüedad (start/end) y cuántas copias activas corre (ads_count/collation).
  const num = (v) => (v == null ? null : Number(v)) || null;
  const start_date = num(item.start_date || item.startDate || snap.start_date);
  const end_date = num(item.end_date || item.endDate || snap.end_date);
  const copies = num(item.ads_count || item.collation_count || item.total) || 1;
  const is_active = item.is_active != null ? !!item.is_active
    : (item.isActive != null ? !!item.isActive : (typeof snap.is_active === "boolean" ? snap.is_active : null));
  const page_id = item.page_id || snap.page_id || item.pageID || null;
  const ad_library_url = item.ad_library_url || item.url ||
    (ad_id ? `https://www.facebook.com/ads/library/?id=${ad_id}` : null);
  const media_type = video_url ? "video" : (image_url ? "static" : null);
  return {
    ad_id: ad_id ? String(ad_id) : null, page_name, video_url, image_url, body, title,
    start_date, end_date, copies, is_active, page_id: page_id ? String(page_id) : null,
    ad_library_url, media_type,
  };
}

/**
 * Corre el actor y devuelve los anuncios ya parseados.
 *
 * Nunca lanza: devuelve `{ ok:false, results:[], reason }` con el motivo real.
 * El que llama decide si reintenta o se rinde — el worker degrada el `count`,
 * el navegador muestra el mensaje.
 */
export async function scrapeAdLibrary(urls, { count = 0, timeoutSecs = RUN_TIMEOUT_SECS } = {}) {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    console.error("[apify] APIFY_TOKEN ausente");
    return { ok: false, results: [], reason: "Apify no configurado (falta APIFY_TOKEN)" };
  }
  const actor = process.env.APIFY_ACTOR || DEFAULT_ACTOR;

  const lista = (Array.isArray(urls) ? urls : [urls]).filter(Boolean).map(toAdUrl);
  if (!lista.length) return { ok: false, results: [], reason: "Sin URLs que scrapear" };

  // count = total de registros a traer. Para búsquedas por marca (1 URL → muchos
  // anuncios) hay que pedir alto; para lotes de ids, uno por url.
  const total = Math.max(Number(count) || 0, lista.length, 1);
  const input = {
    urls: lista.map((u) => ({ url: u, method: "GET" })),
    count: total,
    "scrapePageAds.activeStatus": "all",
    scrapeAdDetails: false,
  };

  const endpoint = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=${timeoutSecs}`;
  const t0 = Date.now();
  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const text = await resp.text();
    console.error(`[apify] actor=${actor} in=${lista.length} count=${total} status=${resp.status} bytes=${text.length} ms=${Date.now() - t0}`);
    if (!resp.ok) {
      return { ok: false, results: [], reason: `Apify status ${resp.status}: ${text.slice(0, 300)}` };
    }
    let data;
    try { data = JSON.parse(text); } catch { return { ok: false, results: [], reason: "Apify no devolvió JSON" }; }
    const items = Array.isArray(data) ? data : (data.items || []);
    const results = items.map(parseItem).filter((r) => r.ad_id || r.video_url || r.page_name);
    const withVideo = results.filter((r) => r.video_url).length;
    console.error(`[apify] parsed=${results.length} withVideo=${withVideo}`);
    return { ok: true, results, count: results.length, withVideo };
  } catch (e) {
    console.error(`[apify] error ${e.message}`);
    return { ok: false, results: [], reason: e.message };
  }
}
