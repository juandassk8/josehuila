// Respaldo de un video, on-demand. Recibe { videoUrl }, baja el video del CDN de
// Meta (con reintentos + proxy) y lo sube a SUPABASE STORAGE (bucket público) —
// sin OAuth de Google Drive (que caducaba y rompía todo). Devuelve la URL pública
// como `drive_url` (reusa el campo). Best-effort: si algo falla, drive_url null.
import { requireTeamMember, sendAuthError, serviceClient } from "./_lib/auth.js";
import { readResponseBuffer, safeExternalFetch } from "./_lib/safeUrl.js";

const DRIVE_MAX = 250 * 1024 * 1024;
const BUCKET = "despliegue-examples";
const STAGE_EMOJI = { tofu: "🟢", mofu: "🟡", bofu: "🔴" };
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function looksLikeHtml(buf) {
  const head = buf.slice(0, 200).toString("utf8").trim().toLowerCase();
  return head.startsWith("<!doctype html") || head.startsWith("<html") || head.startsWith("<?xml");
}

// Descarga con reintentos (fbcdn estrangula la IP del datacenter) + fallback por
// proxy residencial (ScrapingBee/ScraperAPI). Fuentes confiables (Supabase/Drive)
// caen al primer intento; solo fbcdn necesita los reintentos/proxy.
async function downloadBuffer(url, { allowProxy = true, tries = 4 } = {}) {
  const headers = { "User-Agent": UA, "Referer": "https://www.facebook.com/", "Accept": "*/*" };
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const resp = await safeExternalFetch(url, { headers }, { timeoutMs: 45_000 });
      if (resp.ok) return await readResponseBuffer(resp, DRIVE_MAX);
      lastErr = new Error(`descarga falló (${resp.status})`);
      if (![403, 408, 429, 500, 502, 503, 504].includes(resp.status)) break;
    } catch (e) { lastErr = e; }
    if (i < tries - 1) await sleep(500 * (i + 1) + Math.floor(300 * Math.random()));
  }
  if (allowProxy) {
    const bee = process.env.SCRAPINGBEE_API_KEY;
    const scr = process.env.SCRAPERAPI_KEY;
    try {
      let proxUrl = null;
      if (bee) proxUrl = `https://app.scrapingbee.com/api/v1/?api_key=${bee}&url=${encodeURIComponent(url)}&render_js=false&premium_proxy=true&country_code=us`;
      else if (scr) proxUrl = `https://api.scraperapi.com/?api_key=${scr}&url=${encodeURIComponent(url)}&premium=true`;
      if (proxUrl) {
        const resp = await safeExternalFetch(proxUrl, {}, { timeoutMs: 60_000 });
        if (resp.ok) {
          const buf = await readResponseBuffer(resp, DRIVE_MAX);
          if (buf.length > 1000 && !looksLikeHtml(buf)) return buf;
        }
        lastErr = new Error(`proxy no devolvió el video (${resp.status})`);
      }
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("descarga falló");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  try { await requireTeamMember(req); } catch (err) { return sendAuthError(res, err); }

  const { videoUrl, marca, format, stage } = req.body || {};
  if (!videoUrl) return res.status(400).json({ error: "Falta videoUrl" });
  let phase = "descarga";
  try {
    const buf = await downloadBuffer(videoUrl);
    if (!buf?.length) { console.error("[drive-backup] video vacío"); return res.status(200).json({ ok: true, drive_url: null, reason: "video vacío" }); }
    if (buf.length > DRIVE_MAX) return res.status(200).json({ ok: true, drive_url: null, reason: "video muy pesado" });
    phase = "subida";
    // Subida a Supabase Storage (bucket público) — sin OAuth, no caduca, reproducible inline.
    const emoji = STAGE_EMOJI[stage] || "";
    const fmt = (format || "referente").toString().replace(/[^\w\- ]+/g, "").trim().slice(0, 40) || "referente";
    const brand = (marca || "").toString().replace(/[^\w\- ]+/g, "").trim().slice(0, 30);
    const rand = Math.random().toString(36).slice(2, 8);
    const path = `ref-videos/${Date.now()}-${rand}-${(brand || fmt)}.mp4`.replace(/\s+/g, "_");
    const sb = serviceClient();
    const { error } = await sb.storage.from(BUCKET).upload(path, buf, { contentType: "video/mp4", upsert: false, cacheControl: "31536000" });
    if (error) throw new Error(error.message || String(error));
    const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
    const link = data?.publicUrl || null;
    console.error(`[drive-backup] OK ${(buf.length/1e6).toFixed(1)}MB → database ${link}`);
    return res.status(200).json({ ok: true, drive_url: link });
  } catch (e) {
    console.error(`[drive-backup] FALLO en ${phase}: ${e.message}`);
    return res.status(200).json({ ok: true, drive_url: null, reason: `${phase}: ${e.message}` });
  }
}
