// Puente a la API de Foreplay (Fase 2B) — sincronizar boards y DESCUBRIR por marca.
//
// Foreplay tiene un índice de +100M anuncios y rastrea Meta por nosotros (Meta
// no da anuncios comerciales por API y bloquea el scraping directo). Este
// endpoint:
//   - action "boards"   → lista los boards del usuario.
//   - action "ads"      → trae los ads de un board.
//   - action "discover" → dado un link / dominio / nombre de marca, trae TODOS
//     sus anuncios (getAdsByBrandId / getBrandsByDomain / discovery search).
// El frontend inserta los ads normalizados en la Bandeja (reference_inbox).
//
// Envoltorio de respuesta de Foreplay: { data:[...], metadata:{count,cursor}, error }.
// Campos de un ad (del OpenAPI): video, image, thumbnail, full_transcription,
// display_format, ad_id (id de archivo de Meta), foreplay_url, link_url, brand_id.
// Cada ad devuelto cuesta 1 crédito (10k gratis) → limitamos y mostramos el saldo.
//
// El key vive server-only. Gated a team members.

import { requireTeamMember, sendAuthError } from "./_lib/auth.js";

export const config = { api: { bodyParser: { sizeLimit: "1mb" } }, maxDuration: 60 };

const BASE = "https://public.api.foreplay.co";

// Tolera el nombre estándar y la variante con mayúsculas/minúsculas mezcladas.
function getForeplayKey() {
  return process.env.FOREPLAY_API_KEY || process.env.Foreplay_API_Key || process.env.FOREPLAY_KEY || null;
}

// Foreplay no fija si el key va raw o Bearer → probamos raw y, si 401/403, Bearer.
const AUTH_STYLES = [(key) => key, (key) => `Bearer ${key}`];

let lastCreditsRemaining = null;

function pick(obj, names) {
  for (const n of names) if (obj && obj[n] != null && obj[n] !== "") return obj[n];
  return null;
}

// Parámetros de orden/filtro para los endpoints de ads. Por defecto ordenamos
// por "longest_running" = los que llevan MÁS TIEMPO corriendo. Como Facebook no
// publica impresiones de anuncios comerciales, la longevidad es el mejor proxy
// de "anuncio ganador" (las marcas matan lo que no vende y dejan lo que sí).
function adParams({ order, minDays, activeOnly } = {}) {
  const ORDERS = ["longest_running", "newest", "oldest", "most_relevant"];
  const ord = ORDERS.includes(order) ? order : "longest_running";
  const p = [`order=${ord}`];
  const md = Number(minDays);
  if (md > 0) p.push(`running_duration_min_days=${Math.round(md)}`);
  if (activeOnly) p.push("live=true");
  return p.join("&");
}

// Saca el array de resultados sin importar el envoltorio.
function asArray(json) {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.data)) return json.data;
  if (Array.isArray(json?.data?.ads)) return json.data.ads;
  if (Array.isArray(json?.ads)) return json.ads;
  if (Array.isArray(json?.results)) return json.results;
  return [];
}

async function foreplayGet(path) {
  const key = getForeplayKey();
  let lastResp = null, lastText = "";
  for (const style of AUTH_STYLES) {
    const resp = await fetch(`${BASE}${path}`, {
      headers: { authorization: style(key), "content-type": "application/json" },
    });
    const cr = resp.headers.get("x-credits-remaining");
    if (cr != null) lastCreditsRemaining = Number(cr);
    if (resp.ok) return resp.json();
    lastResp = resp;
    lastText = await resp.text();
    if (resp.status !== 401 && resp.status !== 403) break;
  }
  let json;
  try { json = JSON.parse(lastText); } catch { json = { raw: lastText }; }
  const msg = json?.error?.message || json?.error || json?.message || lastText || `HTTP ${lastResp?.status}`;
  throw new Error(`Foreplay ${lastResp?.status}: ${String(msg).slice(0, 300)}`);
}

// Normaliza un ad de Foreplay a la forma que consume la Bandeja.
function normalizeAd(ad) {
  const id = pick(ad, ["id", "_id", "uuid"]);
  const adId = pick(ad, ["ad_id"]);                 // id de archivo de Meta
  const video = pick(ad, ["video", "video_url", "video_hd_url", "video_sd_url"]);
  // OJO: NO usamos "avatar" como portada — es el LOGO de la marca, no el creativo.
  // Si Foreplay no trae imagen/thumbnail real, dejamos portada nula (mejor que el logo).
  const cover = pick(ad, ["image", "thumbnail", "image_url", "cover", "preview"]);
  const avatar = pick(ad, ["avatar", "page_profile_picture", "brand_avatar"]);
  const transcript = pick(ad, ["full_transcription", "transcription", "transcript"]);
  const fmt = (pick(ad, ["display_format", "format"]) || "").toString().toLowerCase();
  let media_type = "video";
  if (/image|carousel|dpa|dco|photo/.test(fmt)) media_type = "static";
  else if (/video|reel|story/.test(fmt)) media_type = "video";
  else media_type = video ? "video" : "static";
  // Preferimos el link REAL de la Biblioteca de Anuncios (armado con el ad_id de
  // Meta): estable y abre el anuncio de verdad. Fallbacks: foreplay_url, link_url.
  const source_url = adId
    ? `https://www.facebook.com/ads/library/?id=${adId}`
    : (pick(ad, ["foreplay_url", "link_url"]) || (id ? `https://app.foreplay.co/discover/ad/${id}` : null));
  const brand = pick(ad, ["brand_name", "page_name", "brand"]) || null;
  // Longevidad: días que lleva corriendo (proxy de "ganador"). Foreplay no
  // documenta el nombre exacto → probamos varias formas y toleramos número,
  // string ("45 days") o timestamp.
  const started = pick(ad, ["started_running", "start_date", "first_seen", "startedRunning", "created_at", "publish_date"]);
  const runDur = pick(ad, ["running_duration", "days_running", "live_time", "duration", "runningDuration", "days", "total_active_time", "active_days"]);
  const live = ad?.live ?? ad?.is_active ?? ad?.active ?? null;
  let days_running = null;
  const toDays = (v) => {
    if (typeof v === "number") return v > 1e11 ? null : Math.round(v); // evita timestamps
    if (typeof v === "string") { const m = v.match(/\d+/); return m ? Number(m[0]) : null; }
    return null;
  };
  days_running = toDays(runDur);
  if (days_running == null && started != null) {
    let t = typeof started === "number" ? (started < 1e12 ? started * 1000 : started) : Date.parse(started);
    if (!isNaN(t) && t > 0) days_running = Math.max(0, Math.floor((Date.now() - t) / 86400000));
  }
  return {
    external_id: id ? String(id) : (adId ? String(adId) : null),
    source_url,
    cover_url: cover || null,
    video_url: video || null,
    transcript: transcript || null,
    brand,
    format_hint: fmt || null,
    media_type,
    days_running,
    live: live == null ? null : !!live,
  };
}

// Fija el nombre de marca en todos los ads del lote (una misma marca → misma marca).
function stampBrand(ads, brand) {
  if (!brand) return ads;
  return ads.map((a) => ({ ...a, brand }));
}

// Anuncio → su marca → todos los ads de la marca (ordenados por opts).
async function adsFromAdId(adId, lim, opts) {
  const one = await foreplayGet(`/api/ad?ad_id=${encodeURIComponent(adId)}`);
  const adObj = one?.data && (Array.isArray(one.data) ? one.data[0] : one.data);
  const brandId = adObj && (adObj.brand_id || adObj.brandId);
  const brandName = adObj && pick(adObj, ["brand_name", "page_name", "brand"]);
  if (brandId) {
    const j = await foreplayGet(`/api/brand/getAdsByBrandId?brand_ids=${encodeURIComponent(brandId)}&limit=${lim}&${adParams(opts)}`);
    return stampBrand(asArray(j).map(normalizeAd), brandName);
  }
  return adObj ? [normalizeAd(adObj)] : [];
}
async function searchQuery(q, lim, opts) {
  const j = await foreplayGet(`/api/discovery/ads?query=${encodeURIComponent(q)}&limit=${lim}&${adParams(opts)}`);
  return asArray(j).map(normalizeAd);
}

// UN anuncio por su ad_id de Meta (para enriquecer links pegados a mano:
// Foreplay nos da el video/portada/transcript, esquivando el bloqueo de Meta).
async function oneAd(adId) {
  const one = await foreplayGet(`/api/ad?ad_id=${encodeURIComponent(adId)}`);
  const adObj = one?.data && (Array.isArray(one.data) ? one.data[0] : one.data);
  if (!adObj) return null;
  let norm = normalizeAd(adObj);
  // El endpoint de un-anuncio a veces devuelve el ad SIN el video/portada real
  // (solo metadatos). Buscamos el mismo ad en la lista de su marca —que trae el
  // media completo— y lo emparejamos por ad_id. Así recuperamos el video para
  // clasificarlo bien (y respaldarlo a Drive) en vez de caer a "imagen del logo".
  if (!norm.video_url) {
    const brandId = adObj.brand_id || adObj.brandId;
    if (brandId) {
      try {
        const j = await foreplayGet(`/api/brand/getAdsByBrandId?brand_ids=${encodeURIComponent(brandId)}&limit=200`);
        const list = asArray(j).map(normalizeAd);
        const idStr = String(adId);
        const match = list.find((a) => (a.source_url || "").includes(idStr) || a.external_id === norm.external_id);
        if (match && (match.video_url || match.cover_url)) {
          norm = {
            ...norm,
            video_url: match.video_url || norm.video_url,
            cover_url: norm.cover_url || match.cover_url,
            transcript: norm.transcript || match.transcript,
            media_type: match.video_url ? "video" : norm.media_type,
          };
        }
      } catch { /* la marca no ayudó → seguimos con lo que haya (puede ir a needsFile) */ }
    }
  }
  return norm;
}

// Resuelve el "seed" del descubrimiento a una lista de ads. Acepta: link de UN
// anuncio, link de página / búsqueda de la Ad Library, dominio de la marca, o nombre.
async function discover(seed, limit, opts) {
  const s = (seed || "").trim();
  if (!s) return [];
  const lim = Math.min(Math.max(Number(limit) || 30, 1), 100);
  const isUrl = /^https?:\/\//i.test(s);
  const SOCIAL = /(facebook|instagram|fb|tiktok|youtube|google|meta)\.com/i;

  // Link de la Biblioteca de Anuncios de Meta: puede ser un anuncio (id=),
  // una página (view_all_page_id=) o una búsqueda (q=).
  if (/facebook\.com\/ads\/library/i.test(s)) {
    const idm = s.match(/[?&]id=(\d{5,})/);
    if (idm) return adsFromAdId(idm[1], lim, opts);
    const pm = s.match(/[?&]view_all_page_id=(\d+)/);
    if (pm) {
      const j = await foreplayGet(`/api/brand/getAdsByPageId?page_id=${encodeURIComponent(pm[1])}&limit=${lim}&${adParams(opts)}`);
      return asArray(j).map(normalizeAd);
    }
    const qm = s.match(/[?&]q=([^&]+)/);
    if (qm) return searchQuery(decodeURIComponent(qm[1].replace(/\+/g, " ")), lim, opts);
    throw new Error("Ese link es una búsqueda general de la Biblioteca de Anuncios. Pegá el link de UN anuncio (que tenga id=…), la página del anunciante, o escribí el nombre de la marca.");
  }

  // Otro link con un id largo de anuncio.
  const idMatch = s.match(/[?&]id=(\d{5,})/) || s.match(/\/(\d{8,})(?:[/?]|$)/);
  if (idMatch) return adsFromAdId(idMatch[1], lim, opts);

  // Dominio de la MARCA (no redes sociales) → getBrandsByDomain → ads.
  if (isUrl || /^[\w-]+(\.[\w-]+)+$/.test(s)) {
    const domain = s.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").replace(/^www\./i, "");
    if (!SOCIAL.test(domain)) {
      const b = await foreplayGet(`/api/brand/getBrandsByDomain?domain=${encodeURIComponent(domain)}&limit=1`);
      const brand = asArray(b)[0];
      const brandId = brand && (brand.id || brand.brand_id);
      const brandName = brand && pick(brand, ["name", "brand_name", "page_name"]);
      if (brandId) {
        const j = await foreplayGet(`/api/brand/getAdsByBrandId?brand_ids=${encodeURIComponent(brandId)}&limit=${lim}&${adParams(opts)}`);
        return stampBrand(asArray(j).map(normalizeAd), brandName);
      }
      return [];
    }
    // Si es un dominio de red social sin datos útiles, caemos a búsqueda de texto.
  }

  // Texto libre / nombre de marca → búsqueda en el índice.
  return searchQuery(s, lim, opts);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    await requireTeamMember(req);
  } catch (err) {
    return sendAuthError(res, err);
  }

  if (!getForeplayKey()) {
    return res.status(500).json({ error: "Falta FOREPLAY_API_KEY (agregala en Vercel → Settings → Environment Variables)." });
  }

  const action = req.query?.action || req.body?.action;
  lastCreditsRemaining = null;

  try {
    if (action === "boards") {
      const json = await foreplayGet("/api/boards?limit=200");
      const boards = asArray(json).map((b) => ({
        id: pick(b, ["id", "board_id", "_id", "uuid"]),
        name: pick(b, ["name", "title", "board_name"]) || "(sin nombre)",
        count: pick(b, ["ad_count", "count", "ads_count"]) ?? null,
      })).filter((b) => b.id != null);
      return res.status(200).json({ ok: true, boards, credits: lastCreditsRemaining });
    }

    const opts = {
      order: req.body?.order,
      minDays: req.body?.minDays,
      activeOnly: req.body?.activeOnly,
    };

    if (action === "ads") {
      const boardId = req.body?.boardId;
      const limit = Math.min(Math.max(Number(req.body?.limit) || 50, 1), 200);
      if (!boardId) return res.status(400).json({ error: "boardId requerido" });
      const json = await foreplayGet(`/api/board/ads?board_id=${encodeURIComponent(boardId)}&limit=${limit}&${adParams(opts)}`);
      const ads = asArray(json).map(normalizeAd).filter((a) => a.source_url);
      return res.status(200).json({ ok: true, ads, count: ads.length, credits: lastCreditsRemaining });
    }

    if (action === "discover") {
      const ads = (await discover(req.body?.seed, req.body?.limit, opts)).filter((a) => a.source_url);
      return res.status(200).json({ ok: true, ads, count: ads.length, credits: lastCreditsRemaining });
    }

    if (action === "one_ad") {
      const adId = req.body?.adId;
      if (!adId) return res.status(400).json({ error: "adId requerido" });
      let ad = null;
      try { ad = await oneAd(String(adId)); } catch { ad = null; }
      return res.status(200).json({ ok: true, ad, credits: lastCreditsRemaining });
    }

    return res.status(400).json({ error: "action requerida: 'boards' | 'ads' | 'discover'" });
  } catch (err) {
    console.error("foreplay-sync error:", err);
    return res.status(502).json({ error: err?.message || String(err) });
  }
}
