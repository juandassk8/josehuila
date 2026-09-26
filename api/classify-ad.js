// Clasificador de anuncios con IA para la Bandeja de referentes (Fase 2A).
//
// Dado un link de Facebook Ads Library (modo auto) o un transcript ya hecho
// (modo texto, fallback), devuelve la clasificación creativa sugerida:
// formato, etapa, tipo, nombre/hook, descripción, etiquetas 4-dim, y si matchea
// un formato existente del banco. No escribe en DB — el frontend guarda el
// resultado en reference_inbox. Gated a team members.
//
// Pipeline modo auto: fetch de la página del anuncio → extraer video_hd_url +
// portada → descargar mp4 → Whisper (transcript) → subir portada a Storage →
// Claude clasifica (transcript + imagen). Si Meta bloquea el fetch, el front usa
// el modo texto (transcribe el archivo en el navegador y manda el transcript).

import { requireTeamMemberOrWorker, sendAuthError, serviceClient } from "./_lib/auth.js";
import { assertSafeExternalUrl, readResponseBuffer, readResponseText, safeExternalFetch } from "./_lib/safeUrl.js";
import { driveEnabled, uploadToDrive } from "./_lib/drive.js";
import { canonizarEtiqueta, vocabularioParaPrompt, categoriaDominante } from "./_lib/labelVocab.js";
import { bloqueVocabulario, cargarVocabulario } from "./_lib/taxonomia.js";

export const config = {
  api: { bodyParser: { sizeLimit: "10mb" } },
  maxDuration: 300,
};

const ANTHROPIC_VERSION = "2023-06-01";
const MODEL = "claude-sonnet-4-6";
const WHISPER_LIMIT = 25 * 1024 * 1024; // 25MB tope de la API de Whisper
const DRIVE_MAX = 250 * 1024 * 1024;    // tope prudente para subir a Drive en memoria
const BUCKET = "despliegue-examples";

// Emoji de etapa = convención de carpetas del usuario en Drive.
const STAGE_EMOJI = { tofu: "🟢", mofu: "🟡", bofu: "🔴" };

// Sube el video a Drive (respaldo persistente, porque los links de Meta expiran)
// si la integración está configurada. Lo guarda en la carpeta del FORMATO
// (ej "🟡 - Founder") según lo que clasificó la IA — igual a tu banco de ads.
// Reusa el buffer ya descargado para Whisper, así no lo baja dos veces. Nunca
// rompe la clasificación: si falla, solo avisa.
async function maybeUploadToDrive(vidBuf, { marca, format, stage } = {}, warnings) {
  if (!vidBuf || !driveEnabled()) return null;
  if (vidBuf.length > DRIVE_MAX) {
    warnings.push("El video es muy pesado para subir a Drive automáticamente.");
    return null;
  }
  try {
    const fmt = (format || "Referentes").toString().trim() || "Referentes";
    const emoji = STAGE_EMOJI[stage] || "";
    const subfolder = (emoji ? `${emoji} - ${fmt}` : fmt).slice(0, 100);
    const brand = (marca || "referente").toString().replace(/[^\w\- ]+/g, "").trim().slice(0, 40) || "referente";
    const { link } = await uploadToDrive({ buffer: vidBuf, filename: `${brand} - ${Date.now()}.mp4`, mimeType: "video/mp4", subfolder });
    return link;
  } catch (e) {
    warnings.push(`No se pudo subir a Drive (${e.message}).`);
    return null;
  }
}

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// Desescapa un valor de URL embebido en el JSON de la página (\/ , \uXXXX).
function unescapeJsonUrl(raw) {
  try { return JSON.parse('"' + raw + '"'); } catch { return raw.replace(/\\\//g, "/"); }
}

// Detecta el tipo de imagen por magic bytes (fbcdn suele servir webp y URLs sin
// extensión limpia — adivinar por la URL hace que Claude rechace el bloque).
function sniffImageType(buf) {
  if (!buf || buf.length < 12) return "image/jpeg";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50) return "image/png";
  if (buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return "image/webp";
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "image/gif";
  return "image/jpeg";
}

// Extrae el mejor video + imagen de portada del HTML del anuncio.
function extractMedia(html) {
  const firstMatch = (patterns) => {
    for (const re of patterns) {
      const m = html.match(re);
      if (m && m[1]) return unescapeJsonUrl(m[1]);
    }
    return null;
  };
  const video = firstMatch([
    /"video_hd_url":"([^"]+)"/,
    /"video_sd_url":"([^"]+)"/,
  ]);
  const image = firstMatch([
    /"original_image_url":"([^"]+)"/,
    /"resized_image_url":"([^"]+)"/,
    /"image_url":"([^"]+)"/,
  ]);
  return { video, image };
}

// El nombre del ANUNCIANTE (página) es la MARCA real, escrita siempre igual por
// Meta. Lo sacamos del HTML de la Biblioteca de Anuncios → marca exacta y
// consistente (sin variantes tipo Cymbiotika/Cimbiotica que inventa la IA).
function extractPageName(html) {
  const pats = [
    /"page_name":"([^"]{2,80})"/,
    /"pageName":"([^"]{2,80})"/,
    /"advertiser_name":"([^"]{2,80})"/,
  ];
  for (const re of pats) {
    const m = html.match(re);
    if (m && m[1]) {
      try { const s = JSON.parse(`"${m[1]}"`).trim(); if (s) return s; } catch { return m[1].trim(); }
    }
  }
  return null;
}

// Baja la página de la Biblioteca de Anuncios. Devuelve { html, via, status, size }.
// Meta bloquea a los servidores (403). Con un "desbloqueador" configurado
// (ScrapingBee/ScraperAPI) routeamos por proxy residencial + render_js (la Ad
// Library es una SPA: el anuncio carga por JS, así que sin render el HTML inicial
// no trae el video). Sin key → intento directo (siempre 403 en Vercel, para diag).
async function fetchAdPage(sourceUrl) {
  const sbKey = process.env.SCRAPINGBEE_API_KEY;
  const saKey = process.env.SCRAPERAPI_KEY;
  let fetchUrl = sourceUrl;
  let via = "directo";
  let opts = {
    headers: {
      "User-Agent": UA,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
  };
  if (sbKey) {
    via = "scrapingbee";
    const params = new URLSearchParams({
      api_key: sbKey, url: sourceUrl,
      render_js: "true", wait: "3500", premium_proxy: "true", country_code: "us", block_resources: "false",
    });
    fetchUrl = `https://app.scrapingbee.com/api/v1/?${params.toString()}`;
    opts = { redirect: "follow" };
  } else if (saKey) {
    via = "scraperapi";
    const params = new URLSearchParams({ api_key: saKey, url: sourceUrl, premium: "true", render: "true", country_code: "us" });
    fetchUrl = `https://api.scraperapi.com/?${params.toString()}`;
    opts = { redirect: "follow" };
  }
  await assertSafeExternalUrl(sourceUrl);
  const resp = await safeExternalFetch(fetchUrl, { ...opts, redirect: undefined }, { timeoutMs: 45_000 });
  const html = await readResponseText(resp, 5 * 1024 * 1024);
  const size = html.length;
  const loginWall = /You must log in to continue|Iniciá sesión para continuar|login_form|checkpoint/i.test(html.slice(0, 4000));
  const info = { html, via, status: resp.status, size, loginWall };
  console.error(`[classify-ad] fetchAdPage via=${via} status=${resp.status} size=${size} loginWall=${loginWall} url=${sourceUrl}`);
  return info;
}

// ¿El buffer descargado es en realidad una página HTML (Drive privado / login /
// interstitial) en vez del binario del video?
function looksLikeHtml(buf) {
  if (!buf || buf.length < 15) return false;
  const head = buf.slice(0, 512).toString("utf8").trim().toLowerCase();
  return head.startsWith("<!doctype html") || head.startsWith("<html") || head.includes("<head");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Baja un binario con REINTENTOS (fbcdn estrangula la IP del datacenter → 403/429
// intermitente) y, si el directo se rinde, FALLBACK por proxy residencial
// (ScrapingBee/ScraperAPI) — la IP residencial no la bloquea el CDN. `allowProxy`
// solo para video (la descarga que sí necesitamos sí o sí para transcribir).
async function downloadBuffer(url, { allowProxy = false, tries = 4 } = {}) {
  await assertSafeExternalUrl(url);
  const headers = { "User-Agent": UA, "Referer": "https://www.facebook.com/", "Accept": "*/*" };
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const resp = await safeExternalFetch(url, { headers }, { timeoutMs: 45_000 });
      if (resp.ok) return await readResponseBuffer(resp, 250 * 1024 * 1024);
      lastErr = new Error(`descarga falló (${resp.status})`);
      // 4xx que no sea throttle (p.ej. 404 URL vencida) → no insistir en directo.
      if (![403, 408, 429, 500, 502, 503, 504].includes(resp.status)) break;
    } catch (e) { lastErr = e; }
    if (i < tries - 1) await sleep(500 * (i + 1) + Math.floor(300 * Math.random()));
  }
  // Fallback por proxy residencial (best-effort, solo video).
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
          const buf = await readResponseBuffer(resp, 250 * 1024 * 1024);
          if (buf.length > 1000 && !looksLikeHtml(buf)) return buf;
        }
        lastErr = new Error(`proxy no devolvió el video (${resp.status})`);
      }
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("descarga falló");
}

// Construye el bloque de imagen para Claude. Intenta bajarla (base64 + para poder
// re-hostearla); si Vercel no puede (fbcdn bloquea datacenter), le pasa la URL a
// Claude para que la baje su servidor. Devuelve { block, buf }.
async function coverBlock(url) {
  if (!url) return { block: null, buf: null };
  try {
    const buf = await downloadBuffer(url);
    return { block: { type: "image", source: { type: "base64", media_type: sniffImageType(buf), data: buf.toString("base64") } }, buf };
  } catch {
    return { block: { type: "image", source: { type: "url", url } }, buf: null };
  }
}

// Whisper "alucina" en audio de solo-música/silencio y devuelve frases-basura
// típicas (créditos de subtítulos, "gracias por ver", solo símbolos musicales).
// Las detectamos y devolvemos "" para no guardar un guion falso.
const TRANSCRIPT_JUNK = [
  /amara\.org/i,
  /subt[íi]tulos?\s+(realizados?|por|hechos?)\s+.*comunidad/i,
  /subtitles?\s+by\s+the\s+amara/i,
  /zeoranger/i,
  /transcript[ie]on?\s+outsourc/i,
  /gracias\s+por\s+ver(lo)?\b/i,
  /thanks?\s+for\s+watching/i,
  /thank\s+you\s+for\s+watching/i,
  /^\s*(subscribe|suscr[íi]bete|like\s+and\s+subscribe)\s*\.?\s*$/i,
];
function cleanTranscript(text) {
  let t = (text || "").trim();
  if (!t) return "";
  // Si es casi puro símbolo musical / puntuación → vacío.
  const words = t.replace(/[♪♫🎵🎶.\-–—…\s]/g, "");
  if (words.length < 3) return "";
  // Quitamos líneas que son basura conocida.
  const lines = t.split(/\n+/).map((l) => l.trim()).filter((l) => l && !TRANSCRIPT_JUNK.some((rx) => rx.test(l)));
  t = lines.join("\n").trim();
  // Si lo que queda es muy corto y matchea basura, vaciamos.
  if (t.length < 4 || TRANSCRIPT_JUNK.some((rx) => rx.test(t))) return "";
  return t;
}

// Transcribe con Whisper. NO forzamos idioma en la API (Whisper autodetecta mejor
// que forzar "es" sobre audio inglés). Pedimos verbose_json para saber el idioma
// detectado → luego traducimos al español si hace falta. Devuelve { text, language }.
async function transcribeBuffer(buffer, filename = "ad.mp4", mime = "video/mp4") {
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mime }), filename);
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");
  const resp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
  });
  if (!resp.ok) throw new Error(`Whisper: ${await resp.text()}`);
  const data = await resp.json();
  return { text: cleanTranscript(data.text || ""), language: data.language || null };
}

// Whisper (verbose_json) devuelve el idioma como código ("es") o nombre completo
// ("spanish"/"español"). Tratamos cualquiera de esos (o idioma ausente) como español.
function isSpanish(language) {
  const l = (language || "").toLowerCase();
  return !l || l === "es" || l.startsWith("es-") || l.startsWith("spanish") || l.startsWith("español") || l.startsWith("espanol");
}

// Traduce un texto al español con una llamada Claude mínima y barata. Devuelve la
// traducción, o "" si Claude no devolvió nada (el caller decide el fallback).
async function translateToSpanish(text) {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": ANTHROPIC_VERSION },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      system: "Traducí este texto al español neutro, sin agregar ni quitar nada; devolvé SOLO la traducción.",
      messages: [{ role: "user", content: [{ type: "text", text: (text || "").slice(0, 12000) }] }],
    }),
  });
  if (!resp.ok) throw new Error(`Claude traducción: ${await resp.text()}`);
  const data = await resp.json();
  return (data.content?.[0]?.text || "").trim();
}

// Variante de translateToSpanish para guiones YA guardados de idioma DESCONOCIDO
// (reparación en lote del banco): si el texto ya está en español lo devuelve
// idéntico; si está en otro idioma lo traduce. Así una sola corrida cubre guiones
// mezclados sin reescribir los que ya estaban bien. Una llamada Claude barata.
async function translateToSpanishIfNeeded(text) {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": ANTHROPIC_VERSION },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      system: "Si el texto ya está en español, devolvelo EXACTAMENTE igual. Si está en otro idioma, traducilo al español neutro sin agregar ni quitar nada. Devolvé SOLO el texto, sin comillas ni comentarios.",
      messages: [{ role: "user", content: [{ type: "text", text: (text || "").slice(0, 12000) }] }],
    }),
  });
  if (!resp.ok) throw new Error(`Claude traducción: ${await resp.text()}`);
  const data = await resp.json();
  return (data.content?.[0]?.text || "").trim();
}

// Transcribe + fuerza el resultado a ESPAÑOL. Si Whisper detecta otro idioma y el
// texto no es basura, lo traduce con Claude. Nunca pierde el texto: si la traducción
// falla, cae al original. Devuelve un string (guion en español o "").
async function transcribeToSpanish(buffer, filename = "ad.mp4", mime = "video/mp4") {
  const { text, language } = await transcribeBuffer(buffer, filename, mime);
  if (!text || !text.trim()) return "";
  if (isSpanish(language)) return text;
  try {
    const translated = await translateToSpanish(text);
    return translated || text;
  } catch (e) {
    console.error(`[classify-ad] traducción a español falló: ${e.message}`);
    return text;
  }
}

// Sube la portada al bucket público y devuelve una URL persistente (las URLs de
// fbcdn expiran; guardamos una copia propia).
async function uploadCover(buffer, contentType = "image/jpeg") {
  const ext = contentType.includes("png") ? "png"
    : contentType.includes("webp") ? "webp"
    : contentType.includes("gif") ? "gif" : "jpg";
  const path = `inbox/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const sb = serviceClient();
  const { error } = await sb.storage.from(BUCKET).upload(path, buffer, { contentType, cacheControl: "3600", upsert: false });
  if (error) throw error;
  const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// Respalda el mp4 ya descargado a Storage (bucket público) → URL PERSISTENTE
// reproducible inline (las de fbcdn expiran). Best-effort: nunca rompe el análisis.
// Si el video supera DRIVE_MAX (250MB) o la subida falla, devuelve null.
async function uploadVideoBackup(buffer, warnings) {
  if (!buffer?.length) return null;
  if (buffer.length > DRIVE_MAX) {
    warnings?.push("El video es muy pesado para respaldar automáticamente.");
    return null;
  }
  try {
    const path = `inbox-videos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`;
    const sb = serviceClient();
    const { error } = await sb.storage.from(BUCKET).upload(path, buffer, { contentType: "video/mp4", cacheControl: "31536000", upsert: false });
    if (error) throw error;
    const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
    return data?.publicUrl || null;
  } catch (e) {
    console.error(`[classify-ad] respaldo de video a Storage falló: ${e.message}`);
    warnings?.push(`No se pudo respaldar el video (${e.message}).`);
    return null;
  }
}

// Devuelve una URL de portada PERSISTENTE (copia propia en Storage), porque las de
// fbcdn expiran. Reusa el buffer que ya bajó coverBlock si está; si no, la baja.
// Si algo falla, cae a la URL original de fbcdn (no regresa nada peor que antes).
async function permanentCover(providedCover, buf) {
  if (!providedCover) return null;
  try {
    const coverBuf = buf || (await downloadBuffer(providedCover));
    if (!coverBuf?.length) return providedCover;
    return await uploadCover(coverBuf, sniffImageType(coverBuf));
  } catch (e) {
    console.error(`[classify-ad] respaldo de portada a Storage falló: ${e.message}`);
    return providedCover;
  }
}

// Exportada para poder probar el prompt contra el modelo sin levantar el endpoint.
export function buildSystemPrompt(knownFormats, knownLabels, vocabCurado = null, formatoReal = null) {
  // Cada formato con su PATRÓN (Cuándo aplica = description, Señas = execution)
  // para que el match sea por patrón, no por nombre.
  const fmtLine = (f) => {
    const bits = [`- id:${f.id} · "${f.name}"${f.stage ? ` (${f.stage})` : ""}`];
    if (f.description) bits.push(`Cuándo: ${f.description}`);
    if (f.execution) bits.push(`Señas: ${f.execution}`);
    if (Array.isArray(f.bank_tags) && f.bank_tags.length) bits.push(`Tags: ${f.bank_tags.slice(0, 8).join(", ")}`);
    return bits.join(" — ");
  };
  const list = (knownFormats || []).length
    ? knownFormats.map(fmtLine).join("\n")
    : "(el banco todavía no tiene formatos)";
  const lbl = knownLabels || {};
  // Con el número de veces que se usa cada una, ordenadas de más a menos. Sin el
  // conteo, una etiqueta usada 500 veces y una inventada una sola vez se veían
  // igual de válidas, y el modelo elegía cualquiera.
  // …salvo para NICHO y SUBNICHO, que van SIN número a propósito.
  //
  // El conteo es un argumento de autoridad: "Salud (378)" le dice al modelo que
  // esa es la apuesta segura. Para marca y formato eso es exactamente lo que
  // queremos —dicen cuál es la escritura establecida de algo que ya existe—.
  // Para el nicho es veneno: cuando llega un mercado que NO está en la lista
  // —sillas gamer— el número empuja a meterlo en el más grande. Así 80 anuncios
  // de muebles terminaron en Salud, Ropa y Calzado.
  // Con vocabulario curado, el bloque de etiquetas sale de las tablas `tax_*`.
  // Sin él —si la consulta falló— se cae al modo viejo: peor, pero clasifica.
  const vocab_bloque = vocabCurado
    ? bloqueVocabulario(vocabCurado, formatoReal)
    : `VOCABULARIO (del propio banco, sin curar):\n- nicho: ${vocabularioParaPrompt(knownLabels?.counts?.nicho || {}, 40, { conConteo: false })}\n- angulo: ${vocabularioParaPrompt(knownLabels?.counts?.angulo || {})}`;

  const SIN_CONTEO = new Set(["nicho", "subnicho"]);
  const vocab = (cat) => {
    const conteos = lbl.counts?.[cat];
    if (conteos && Object.keys(conteos).length) {
      return SIN_CONTEO.has(cat)
        ? vocabularioParaPrompt(conteos, 40, { conConteo: false })
        : vocabularioParaPrompt(conteos);
    }
    return lbl[cat]?.length ? lbl[cat].slice(0, 40).join(", ") : "(ninguna todavía)";
  };
  return `Sos un estratega creativo de performance. Analizás un anuncio (su transcripción y/o portada) y lo clasificás para un banco de creativos publicitarios. Si no hay transcripción, clasificá SOLO por la imagen — igual devolvé todos los campos.

Identificá el FORMATO del anuncio con criterio de marketer. Ejemplos: "B-roll voz en off", "UGC", "Noticia", "Founder/Cofounder", "Celebridad", "Podcast", "Testimonial", "Video oferta", "Antes/después", "Comparativo", "Profesional/Experto hablando", "Diálogo", "Estático con texto", "Animado".

El FORMATO es lo MÁS IMPORTANTE de acertar. Elegí el formato por CÓMO ESTÁ HECHO el anuncio (quién habla, qué se muestra, la estructura), NO por el tema/producto. Reglas discriminadoras (críticas — no las confundas):
- UGC = una persona común / creador/a graba de forma casera (celular, selfie, su casa) mostrando o usando el producto como si fuera un usuario real. Tono espontáneo, no publicitario.
- Fundador / Empresa = habla la MARCA en primera persona: el dueño/fundador/equipo ("yo creé…", "en [Marca] fabricamos/confeccionamos/hacemos…", "nuestro producto"). Si la voz representa a la empresa que vende, es Fundador/Empresa, NUNCA UGC.
- Testimonial = un CLIENTE real cuenta su experiencia/resultado con el producto (no el creador genérico, no la marca).
- Experto/Profesional = un médico/especialista/autoridad explica con criterio técnico.
- Noticia = imita una nota de prensa / medio (titular, presentador, estética de noticiero).
- Celebridad = figura reconocida. Podcast = formato entrevista/2 personas charlando. Diálogo = conversación actuada.
Pista clave: leé la TRANSCRIPCIÓN. Frases como "en [tienda/marca] nosotros…" o "por eso creé…" → Fundador/Empresa. "Yo compré esto y…" de alguien que no es la marca → UGC o Testimonial según sea uso casual (UGC) o resultado/experiencia (Testimonial).

Etapa del funnel (va SOLO en suggested_stage — NO metas "TOFU/MOFU/BOFU" ni la etapa dentro del nombre del formato):
- tofu = atraer público nuevo (problema/educación/hook fuerte)
- mofu = considerar/confiar (demostración, comparativa, experto)
- bofu = convertir/cerrar (oferta, testimonial fuerte, urgencia)

CONCEPTOS DEL BANCO — carpetas donde ya se guardan referencias, cada una con su PATRÓN (Cuándo aplica / Señas). Sirven para UNA sola cosa: si el anuncio calza en el patrón de alguna, devolvé su id en matched_concept_id para que quede guardado ahí.

Sus NOMBRES no son vocabulario. Muchos vienen de antes de que existiera el catálogo y traen la etapa pegada («Venta (Tofu)») o errores de tipeo («Podcats»). El nombre que devuelvas en suggested_format sale SIEMPRE del catálogo de CONCEPTOS de más abajo, nunca de esta lista. Matcheá por PATRÓN, no porque el nombre suene parecido:
${list}

REGLAS DE FORMATO (críticas — el banco es la ÚNICA fuente de verdad):
- El nombre sale TAL CUAL del catálogo de CONCEPTOS. Nunca le agregues la etapa («Venta», no «Venta (Tofu)»), ni el medio («Oferta», no «Video Oferta»), ni la palabra video/tv/foto/imagen/estático/reel.
- Si el concepto del banco con el que matcheaste se llama distinto al del catálogo, gana el del catálogo.
- COHERENCIA CON EL MEDIO: cada concepto dice de qué medio suele ser. Un anuncio de imagen no puede ser un concepto que exige video (UGC hablado, diálogo, podcast) ni al revés.

${vocab_bloque}
MARCAS que ya están en el banco — si la marca del anuncio es alguna de estas (aunque esté escrita distinto), devolvé EXACTAMENTE la de acá:
${vocab("marca")}

REGLAS DE ETIQUETAS (críticas — mantené el banco LIMPIO, sin explotar en sinónimos):
1. Poné SOLO el valor MÁS DOMINANTE por categoría: marca → 1, nicho → 1, subnicho → 1 (opcional), angulo → 1 (máx 2 si hay dos clarísimos), formato → 1.
1b. NICHO = el MERCADO amplio, entendido como CATEGORÍA DE PRODUCTO: qué cosa se vende (Calzado, Ropa, Muebles, Mascotas, Suplementos, Belleza, Salud). SUBNICHO = el sub-mercado ESPECÍFICO dentro del nicho: el problema, la zona del cuerpo o la audiencia que el producto ataca (ej. nicho "Calzado" → subnicho "Sneakers"; nicho "Belleza" → "Skincare"/"Cabello"). Poné SIEMPRE el nicho amplio, y un subnicho cuando el producto claramente apunte a uno. NO pongas un ángulo de venta (ej. "Bajar de peso") como nicho ni subnicho.

1c. EL NICHO ES LA ÚNICA CATEGORÍA DONDE INVENTAR ES CORRECTO. Si el producto pertenece a un mercado que NO está en la lista de nichos, CREÁ EL NICHO NUEVO. No lo metas a la fuerza en el que más se parezca: una etiqueta falsa ensucia el banco mucho más que una etiqueta nueva.
   Caso real que hay que evitar: 80 anuncios de SILLAS GAMER Y ESCRITORIOS quedaron etiquetados como "Salud", "Ropa" y "Calzado" porque no existía un nicho de muebles. Lo correcto era crear "Muebles".
   La prueba: leé el nicho que elegiste junto al producto —"una silla gamer es del nicho Salud"— y preguntate si eso lo diría alguien que conoce el negocio. Si suena falso, es falso: creá el nicho que corresponde.
   Un nicho nuevo es UNA palabra, categoría de producto, en plural cuando aplique: "Muebles", "Tecnología", "Juguetes", "Bebidas".
2. NUNCA COMPONGAS UNA ETIQUETA (la regla que más se rompe). Una etiqueta nombra UNA cosa: prohibido unir conceptos con "y", "/", "+", coma o paréntesis. Si el producto es de pijamas y también de lencería, elegí el concepto DOMINANTE y poné SOLO ese. Ejemplos de lo que NO se hace: "Pijamas y ropa de dormir" → poné "Pijamas". "Lencería y pijamas" → poné "Pijamas". "Salud digestiva y alergias caninas" → poné el que el anuncio realmente ataca. Una etiqueta compuesta es siempre un error, aunque las dos partes sean ciertas.
3. ANTES DE INVENTAR, BUSCÁ. Recorré la lista de arriba y preguntate por cada una: "¿esta etiqueta describe este anuncio?". Si alguna aplica, usala EXACTAMENTE como está escrita (misma escritura, mismo singular/plural, mismos acentos) — aunque a vos se te ocurra una forma que te suena mejor. "Ropa de dormir" cuando ya existe "Pijamas" no es una etiqueta nueva: es la misma con otro nombre, y parte el banco en dos.
3b. Crear una etiqueta nueva es la EXCEPCIÓN en marca, formato y ángulo — ahí son catálogos que ya están completos y casi siempre hay una que aplica; cuando dudes entre reusar e inventar, reusá la de la lista con el número más alto. Con el NICHO es al revés: ver la regla 1c. Cuando crees cualquier etiqueta: una sola palabra o dos, sin "y", sin paréntesis, sin la marca adentro, y del mismo estilo que las que ya están.
4. suggested_labels.formato: un único sub-estilo dominante (idealmente uno del vocabulario).
5. MARCA (crítico): la marca es la que se PUBLICITA (el producto/anunciante), NO el creador. Muchos anuncios son colaboraciones creador×marca (un influencer promociona una marca): en esos casos el nombre de la marca aparece en el texto/audio/caption o sobreimpreso — buscalo ahí, no pongas el nombre del creador. Si la marca detectada es casi igual a una de la lista de "marca" de arriba (mismo nombre con distinta tipografía, con/sin acentos, singular/plural, con/sin sufijo tipo "Oficial"/"Store"), devolvé EXACTAMENTE la de la lista. Si de verdad no lográs identificar ninguna marca, devolvé "marca": [].

Devolvé EXCLUSIVAMENTE un JSON válido (sin markdown, sin \`\`\`), con esta forma:
{
  "suggested_format": "<nombre EXACTO del catálogo de CONCEPTOS. Sin etapa, sin prefijo de medio>",
  "suggested_stage": "tofu" | "mofu" | "bofu",
  "suggested_media_type": "video" | "static",
  "suggested_name": "<hook o nombre corto del anuncio>",
  "suggested_description": "<2-4 frases sobre CÓMO ESTÁ HECHO el video, como guía para replicarlo: el gancho de los primeros segundos, la construcción visual (escenas, tomas, texto en pantalla, tono), la estructura/orden y el ritmo, y cómo conecta con el producto. Concreto y accionable. CRÍTICO: describí SOLO lo que realmente se ve/oye; NO inventes marcas, nombres, cifras ni datos que no aparezcan en el creativo. Si no estás seguro de un dato, no lo menciones.>",
  "suggested_labels": { "marca": ["<1>"], "nicho": ["<1>"], "subnicho": ["<0-1>"], "angulo": ["<1-2>"], "formato": ["<1>"] },
  "momento": "<uno EXACTO de la lista de momento, o null si el anuncio no da señal>",
  "conciencia": <1 a 5, el nivel de conciencia de quien lo ve>,
  "hook_tipo": "<uno EXACTO de la lista de hook, o null si no hay video ni se ve el arranque>",
  "matched_concept_id": "<id de un formato existente o null>",
  "format_reason": "<1 frase: POR QUÉ ese formato — qué patrón/seña del anuncio lo define (ej. 'habla el dueño y dice en X fabricamos → Fundador'). Concreto, basado en lo que se ve/oye.>",
  "format_confidence": <número 0 a 1: qué tan seguro estás del FORMATO puntual>,
  "ai_confidence": <número 0 a 1>
}`;
}

async function classifyWithClaude({ transcript, imageBlock, knownFormats, knownLabels, mediaType, advertiser = null, adCopy = null }) {
  // "unknown" = solo tenemos una portada y no sabemos si es un estático o el
  // frame de un video. Ahí no se filtra: filtrar mal sería peor que no filtrar.
  const formatoReal = mediaType === "video" ? "video" : (mediaType === "static" ? "estatico" : null);
  // El vocabulario curado. Si la consulta falla, `null` hace que el prompt use
  // el modo viejo — clasificar peor es mejor que no clasificar.
  let vocab = null;
  try { vocab = await cargarVocabulario(); } catch { /* modo viejo */ }
  const content = [];
  if (imageBlock) content.push(imageBlock);
  // Pista del anunciante (página de Meta) para la MARCA. Suele ser la marca, pero
  // en colaboraciones es el creador — que la IA reconcilie con la marca real.
  const advLine = advertiser
    ? `\n\nANUNCIANTE (página de Meta): "${advertiser}". Esta suele ser la MARCA — usala como marca. EXCEPCIÓN: si "${advertiser}" es claramente el nombre de una PERSONA/CREADOR (colaboración) y el anuncio promociona otra marca, la marca es la PROMOCIONADA (buscala en el texto/producto/logo; preferí una de la lista de marcas conocidas). NUNCA pongas el nombre del creador como marca.`
    : "";
  const typeLine = mediaType === "static"
    ? "Tipo de anuncio: imagen estática."
    : mediaType === "unknown"
      ? "IMPORTANTE: solo tenés la PORTADA (una imagen), sin video ni transcripción. Puede ser (a) un anuncio de imagen estática, o (b) la portada/thumbnail de un VIDEO. Decidí suggested_media_type con criterio: si es una pieza gráfica con copy/diseño sobreimpreso → 'static'; si parece un frame de una escena real (persona, producto en uso, UGC) → 'video'. Si la imagen es SOLO un logo o un placeholder de marca sin contenido real del anuncio, marcá 'video', poné ai_confidence ≤ 0.35 y en la descripción aclará que la portada no muestra el creativo real. NUNCA inventes una descripción de anuncio estático a partir de un simple logo."
      : "Tipo de anuncio: video.";
  content.push({
    type: "text",
    // El copy que Meta publica junto al anuncio. Para un estático sin
    // transcripción es LA fuente de texto: sin él, el modelo clasifica una
    // imagen a ciegas teniendo el mensaje escrito al lado.
    text: `${typeLine}${advLine}${adCopy ? `\n\nTexto publicado con el anuncio:\n"""\n${String(adCopy).slice(0, 1200)}\n"""` : ""}\n\nTranscripción del anuncio:\n"""\n${(transcript || "(sin audio / transcripción vacía)").slice(0, 6000)}\n"""\n\nClasificá este anuncio y devolvé SOLO el JSON.`,
  });

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1200,
      // El system prompt (instrucciones + vocabulario) es idéntico en toda la tanda →
      // lo cacheamos (ephemeral) para no re-cobrarlo entero en cada anuncio. Solo la
      // imagen+transcript (variable) se cobran completos.
      system: [{ type: "text", text: buildSystemPrompt(knownFormats, knownLabels, vocab, formatoReal), cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content }],
    }),
  });
  if (!resp.ok) throw new Error(`Claude: ${await resp.text()}`);
  const data = await resp.json();
  const raw = data.content?.[0]?.text || "";
  let jsonText = raw.trim();
  const fenced = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    jsonText = fenced[1].trim();
  } else {
    // Sin fence: extraemos el primer objeto {...} por si Claude antepuso texto.
    const braced = jsonText.match(/\{[\s\S]*\}/);
    if (braced) jsonText = braced[0];
  }
  try {
    return JSON.parse(jsonText);
  } catch {
    throw new Error("Claude no devolvió un JSON válido");
  }
}

// Destila el patrón GENERAL de un formato a partir de VARIAS referencias
// (guion + cómo está hecho + etiquetas) → { description, execution }. Pensado
// para que luego una empresa con OTRO producto pueda replicar el formato.
async function synthesizeFormat({ formatName, references }) {
  const items = (references || []).slice(0, 40).map((r, i) => {
    const l = r.labels || {};
    const tags = ["marca", "nicho", "angulo"].map((k) => (Array.isArray(l[k]) ? l[k].join("/") : "")).filter(Boolean).join(" · ");
    return `#${i + 1}${tags ? ` [${tags}]` : ""}\nNombre: ${r.name || "—"}\nCómo está hecho: ${(r.notes || "—").slice(0, 600)}\nGuion: ${(r.transcript || "(sin guion)").slice(0, 1500)}`;
  }).join("\n\n---\n\n");

  const system = `Sos un estratega creativo de performance. Te paso VARIAS referencias reales del MISMO FORMATO de anuncio ("${formatName || "formato"}"): guion, cómo está hecha cada una y etiquetas. Destilá el PATRÓN GENERAL del formato para que una empresa con OTRO producto pueda replicarlo.

Devolvé EXCLUSIVAMENTE un JSON válido (sin markdown), con esta forma:
{
  "description": "<qué ES este formato y por qué funciona: el mecanismo, a quién le apela, en qué etapa del funnel encaja. General, aplicable a cualquier producto. 3-5 frases.>",
  "execution": "<CÓMO se hace, paso a paso y accionable, en viñetas que empiecen con '- ': estructura (gancho → desarrollo → cierre/CTA), qué mostrar en cada parte, tipo de tomas / voz en off / texto en pantalla, duración y ritmo. General, NO atado a una marca puntual.>"
}
Basate SOLO en los patrones que se REPITEN entre las referencias. NO inventes datos de una marca específica ni cifras que no estén.`;

  const content = [{ type: "text", text: `FORMATO: ${formatName || "(sin nombre)"}\n\nREFERENCIAS:\n\n${items}\n\nDestilá el patrón general y devolvé SOLO el JSON.` }];
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": ANTHROPIC_VERSION },
    body: JSON.stringify({ model: MODEL, max_tokens: 1600, system, messages: [{ role: "user", content }] }),
  });
  if (!resp.ok) throw new Error(`Claude: ${await resp.text()}`);
  const data = await resp.json();
  let jsonText = (data.content?.[0]?.text || "").trim();
  const fenced = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) jsonText = fenced[1].trim();
  else { const braced = jsonText.match(/\{[\s\S]*\}/); if (braced) jsonText = braced[0]; }
  try { const o = JSON.parse(jsonText); return { description: (o.description || "").trim(), execution: (o.execution || "").trim() }; }
  catch { throw new Error("Claude no devolvió un JSON válido"); }
}

// Normaliza los ENCABEZADOS de un documento de referencias a formato estructurado:
// por cada uno → { concept (formato madre), subConcept, stage, media }. Matchea a
// conceptos existentes cuando son equivalentes.
async function parseHeaders({ headers, knownConcepts = [] }) {
  const system = `Sos un clasificador de formatos de anuncios. Te paso TODOS los ENCABEZADOS (nombres de sección de un documento de referentes) de una vez + los CONCEPTOS que YA existen en el banco. Por cada encabezado devolvé { concept, subConcept, stage, media }.

REGLAS (críticas):
1. ETAPA vs SUB-VARIACIÓN:
   - Si el MISMO formato base aparece en varias ETAPAS del funnel a lo largo del documento (ej. "UGC Tofu",
     "UGC Mofu", "UGC Bofu"), cada uno es un CONCEPTO DISTINTO: poné la etapa DENTRO del nombre → concept
     "UGC Tofu" / "UGC Mofu" / "UGC Bofu", y stage "tofu"/"mofu"/"bofu". subConcept "".
   - Si es una VARIACIÓN DE ESTILO entre paréntesis de un formato base (ej. "UGC (Carro)", "UGC (Green Screen)"),
     el concept es el formato MADRE ("UGC"), subConcept = la variación ("Carro", "Green Screen"), stage según
     contexto (default "tofu").
2. MATCH: si el concept equivale a uno de los CONCEPTOS EXISTENTES (misma idea, distinta escritura), devolvé
   EXACTO el nombre existente.
3. stage: "tofu" | "mofu" | "bofu" si el encabezado lo indica (ej "(mofu)", "Bofu"); si no podés inferirlo, "tofu".
4. media: "static" si es claramente estático (contiene "estático/estatico/post/collage/notas/foro" sin video);
   si no, "video".

CONCEPTOS EXISTENTES: ${(knownConcepts || []).slice(0, 90).join(", ") || "(ninguno)"}

Devolvé EXCLUSIVAMENTE un JSON válido:
{ "headers": [ { "header": "<tal cual llegó>", "concept": "...", "subConcept": "...", "stage": "tofu", "media": "video" } ] }`;
  const content = [{ type: "text", text: `ENCABEZADOS:\n${(headers || []).map((h, i) => `${i + 1}. ${h}`).join("\n")}\n\nDevolvé SOLO el JSON.` }];
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": ANTHROPIC_VERSION },
    body: JSON.stringify({ model: MODEL, max_tokens: 3000, system, messages: [{ role: "user", content }] }),
  });
  if (!resp.ok) throw new Error(`Claude: ${await resp.text()}`);
  const data = await resp.json();
  let jsonText = (data.content?.[0]?.text || "").trim();
  const fenced = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) jsonText = fenced[1].trim();
  else { const braced = jsonText.match(/\{[\s\S]*\}/); if (braced) jsonText = braced[0]; }
  try {
    const o = JSON.parse(jsonText);
    return (Array.isArray(o.headers) ? o.headers : []).map((h) => ({
      header: (h?.header || "").toString(),
      concept: (h?.concept || "").toString().trim(),
      subConcept: (h?.subConcept || "").toString().trim(),
      stage: ["tofu", "mofu", "bofu"].includes((h?.stage || "").toLowerCase()) ? h.stage.toLowerCase() : "",
      media: h?.media === "static" ? "static" : "video",
    }));
  } catch { throw new Error("Claude no devolvió un JSON válido"); }
}

// Extrae la ESTRATEGIA DE VENTA de un texto libre (el plan de implementación que
// Jose arma con la empresa) → ángulos de venta, objeciones y niveles de conciencia,
// cada uno { title, desc }. Solo lo que esté en el texto; no inventa.
// Parseo tolerante de JSON de Claude: intenta directo, luego sin comas colgantes,
// y por último RECONSTRUYE un JSON truncado (respuesta cortada por max_tokens):
// recorta al último objeto completo y cierra los [ { que quedaron abiertos.
// Devuelve el objeto, o null si nada funciona.
function parseJsonResilient(raw) {
  const s = (raw || "").trim();
  const tries = [s, s.replace(/,\s*([}\]])/g, "$1")];
  // Reconstrucción de truncado: cortar tras el último "}" y balancear la pila.
  let t = s;
  const lastObj = t.lastIndexOf("}");
  if (lastObj !== -1) t = t.slice(0, lastObj + 1);
  const stack = [];
  let inStr = false, esc = false;
  for (const ch of t) {
    if (esc) { esc = false; continue; }
    if (ch === "\\") { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") { if (stack[stack.length - 1] === ch) stack.pop(); }
  }
  let closed = t.replace(/,\s*$/, "");
  while (stack.length) closed += stack.pop();
  tries.push(closed);
  for (const a of tries) { try { return JSON.parse(a); } catch { /* siguiente intento */ } }
  return null;
}

async function extractStrategy({ text }) {
  const system = `Sos un estratega de marketing. Te paso un TEXTO (un plan de implementación / brief de una empresa). Extraé los PUNTOS DE CONTACTO de venta y clasificá cada uno en su categoría:
- angles (ángulos de venta): motivos, beneficios o dolores por los que la gente COMPRA.
- objections (objeciones): motivos por los que la gente NO compra (dudas, frenos, malas experiencias previas).
- awareness (conciencia): cosas que el cliente no sabe/no entiende y, si las entendiera, compraría más (educación, cambios de mentalidad, mitos a derribar).

Devolvé EXCLUSIVAMENTE un JSON válido (sin markdown):
{
  "angles":     [{ "title": "<3-6 palabras>", "desc": "<1-2 frases accionables>" }],
  "objections": [{ "title": "…", "desc": "…" }],
  "awareness":  [{ "title": "…", "desc": "…" }]
}
Reglas: extraé SOLO lo que está en el texto (no inventes marcas/datos). Título corto y claro; descripción concreta de cómo se usa ese punto para vender. Si una categoría no aparece, devolvé [].`;

  const content = [{ type: "text", text: `TEXTO:\n"""\n${(text || "").slice(0, 24000)}\n"""\n\nExtraé la estrategia y devolvé SOLO el JSON.` }];
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": ANTHROPIC_VERSION },
    // Amplio: una lista larga (muchos ángulos/objeciones) puede exceder 2000 y
    // cortar el JSON a la mitad → parse falla. 8000 da aire de sobra.
    body: JSON.stringify({ model: MODEL, max_tokens: 8000, system, messages: [{ role: "user", content }] }),
  });
  if (!resp.ok) throw new Error(`Claude: ${await resp.text()}`);
  const data = await resp.json();
  let jsonText = (data.content?.[0]?.text || "").trim();
  const fenced = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) jsonText = fenced[1].trim();
  else { const braced = jsonText.match(/\{[\s\S]*\}/); if (braced) jsonText = braced[0]; }
  const clean = (arr) => (Array.isArray(arr) ? arr : []).map((it) => ({ title: (it?.title || "").toString().trim(), desc: (it?.desc || "").toString().trim() })).filter((it) => it.title);
  const o = parseJsonResilient(jsonText);
  if (!o) throw new Error("Claude no devolvió un JSON válido");
  return { angles: clean(o.angles), objections: clean(o.objections), awareness: clean(o.awareness) };
}

// Clave normalizada de marca (minúsculas, sin acentos ni símbolos) para comparar.
function brandKey(s) {
  return (s || "").toString().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
}
function lev(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}
// Si el valor detectado es una VARIANTE de uno conocido del banco, devolvemos la
// ESCRITURA CANÓNICA existente. `fuzzy=true` (marca) tolera typos/prefijos
// ("Cimbiotica"→"Cymbiotika"); `fuzzy=false` (nicho/ángulo/formato) solo colapsa
// mayúsculas/acentos/símbolos ("RYZE"/"ryze"→"Ryze") sin fusionar palabras distintas.
function canonicalValue(value, knownValues, fuzzy = false) {
  const k = brandKey(value);
  if (!k || k.length < 3) return value;
  let best = null, bestD = Infinity;
  for (const kv of (knownValues || [])) {
    const kk = brandKey(kv);
    if (!kk) continue;
    if (kk === k) return kv;                                    // igual (ignora caso/acentos/símbolos)
    if (!fuzzy) continue;
    const d = lev(k, kk);
    const thr = Math.min(k.length, kk.length) >= 6 ? 2 : 1;     // tolerancia por largo
    if ((kk.startsWith(k) || k.startsWith(kk) || d <= thr) && d < bestD) { best = kv; bestD = d; }
  }
  return best || value;
}
function canonicalBrand(brand, knownBrands) { return canonicalValue(brand, knownBrands, true); }

// Normaliza y valida la salida de Claude contra los formatos conocidos.
// forcedMarca: marca fija del lote (Foreplay). knownLabels: vocabulario del banco
// {marca,nicho,angulo,formato} para canonicalizar variantes en TODAS las categorías.
// Normaliza un nombre de formato para comparar: minúsculas, sin tildes, sin el
// sufijo de etapa y SIN palabras de medio (video/tv/foto/imagen/estático/reel).
// Así "Video Oferta", "Tv Comercial", "Oferta (Bofu)" colapsan a su formato base.
function normFormatName(s) {
  return (s || "").toString().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\((tofu|mofu|bofu)\)/g, " ")
    .replace(/\b(videos?|vid|tv|foto|fotos|imagen|imagenes|estatico|estatica|estaticos|estaticas|reel|reels|clip|clips|anuncio|ad|ads)\b/g, " ")
    .replace(/[^a-z0-9ñ ]/g, " ").replace(/\s+/g, " ").trim();
}
// Mapea el nombre propuesto por la IA a un formato que YA existe en el banco.
// Devuelve { id, name, stage } o null. Prefiere el de la misma etapa si hay varios.
function snapFormat(name, stage, knownFormats) {
  const target = normFormatName(name);
  if (!target || !(knownFormats || []).length) return null;
  const cands = knownFormats.filter((f) => normFormatName(f.name) === target);
  if (!cands.length) return null;
  const byStage = cands.find((f) => f.stage && f.stage === stage);
  const pick = byStage || cands[0];
  return { id: pick.id, name: pick.name, stage: pick.stage || null };
}

function normalize(parsed, knownFormats, forcedMarca, knownLabels = {}) {
  const media = parsed?.suggested_media_type === "static" ? "static" : "video";
  const labelsRaw = parsed?.suggested_labels || {};
  const labels = {};
  // Tope duro por categoría: 1 dominante (2 para ángulo). Aunque el modelo se
  // pase, recortamos para no explotar el banco en etiquetas.
  const CAP = { marca: 1, nicho: 1, subnicho: 1, angulo: 2, formato: 1 };
  const vocab = (knownLabels && typeof knownLabels === "object" && !Array.isArray(knownLabels)) ? knownLabels : { marca: knownLabels };
  for (const cat of ["marca", "nicho", "subnicho", "angulo", "formato"]) {
    const v = labelsRaw[cat];
    const arr = Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()) : [];
    // Canonicalizar cada valor contra el vocabulario de su categoría (colapsa
    // variantes de escritura). Difuso solo para marca; exacto para el resto.
    // Dos pasadas: primero el canonizador de vocabulario, que colapsa las
    // compuestas ("Pijamas y ropa de dormir" → "Pijamas") y las variantes de
    // orden/plural/acento; si no reconoce nada, el de marca, que además tolera
    // erratas. Lo que sobrevive a las dos es una etiqueta genuinamente nueva.
    labels[cat] = arr.slice(0, CAP[cat]).map((val) => {
      const conocidas = vocab[cat] || [];
      return canonizarEtiqueta(val, conocidas, { fuzzy: cat === "marca" })
        || canonicalValue(val, conocidas, cat === "marca");
    });
  }
  // Reencauce por categoría: si el modelo puso un valor donde no vive.
  //
  // El prompt ya prohíbe "poner un ángulo de venta como nicho", pero eso es una
  // instrucción: cuando el modelo la ignora, nadie la hace cumplir. Así llegamos
  // a "Bajar de peso" como nicho 11 veces al lado de 186 como ángulo.
  //
  // No hay lista de qué es un nicho: manda el uso real del banco, y solo cuando
  // la mayoría es aplastante. La marca queda afuera —un nombre propio no se
  // reencauza— y también el reencauce hacia marca, que convertiría un concepto
  // en un anunciante.
  const conteos = vocab.counts;
  if (conteos) {
    for (const cat of ["nicho", "subnicho", "angulo", "formato"]) {
      const quedan = [];
      for (const val of labels[cat]) {
        const dueño = categoriaDominante(val, conteos);
        if (!dueño || dueño === cat || dueño === "marca") { quedan.push(val); continue; }
        // Va a su categoría real, respetando el tope de esa categoría.
        if (!labels[dueño].some((x) => x.toLowerCase() === val.toLowerCase()) && labels[dueño].length < CAP[dueño]) {
          labels[dueño].push(val);
        }
      }
      labels[cat] = quedan;
    }
  }

  // Marca fija del lote → constante en todos los anuncios de la misma marca.
  if (forcedMarca && forcedMarca.trim()) labels.marca = [canonicalBrand(forcedMarca.trim(), vocab.marca || [])];

  let matched = parsed?.matched_concept_id || null;
  const mf = matched ? (knownFormats || []).find((f) => f.id === matched) : null;
  if (matched && !mf) matched = null;
  // Etapa: la de la IA, pero si matchea un formato existente respetamos SU etapa.
  let stage = ["tofu", "mofu", "bofu"].includes(parsed?.suggested_stage) ? parsed.suggested_stage : null;
  if (mf?.stage && ["tofu", "mofu", "bofu"].includes(mf.stage)) stage = mf.stage;

  // Formato → SNAP al banco: si el modelo matcheó, usamos el nombre canónico exacto.
  // Si no matcheó pero el nombre corresponde a un formato existente (ignorando
  // prefijos de medio/etapa), lo enganchamos igual → nada de "Video Oferta"/"Tv
  // Comercial" nuevos cuando ya existe "Oferta"/"Comercial" en el banco.
  let fmtName = (parsed?.suggested_format || "").toString().trim() || null;
  if (mf) {
    fmtName = mf.name;
  } else {
    const snap = snapFormat(fmtName, stage, knownFormats);
    if (snap) { matched = snap.id; fmtName = snap.name; if (["tofu", "mofu", "bofu"].includes(snap.stage)) stage = snap.stage; }
  }

  let conf = Number(parsed?.ai_confidence);
  if (!(conf >= 0 && conf <= 1)) conf = null;
  let fmtConf = Number(parsed?.format_confidence);
  if (!(fmtConf >= 0 && fmtConf <= 1)) fmtConf = null;
  return {
    suggested_format: fmtName,
    suggested_stage: stage,
    suggested_media_type: media,
    suggested_name: (parsed?.suggested_name || "").toString().trim() || null,
    suggested_description: (parsed?.suggested_description || "").toString().trim() || null,
    suggested_labels: labels,
    matched_concept_id: matched,
    format_reason: (parsed?.format_reason || "").toString().trim() || null,
    format_confidence: fmtConf,
    ai_confidence: conf,
    // Los tres ejes nuevos se pasan tal cual: la validación contra las listas
    // cerradas vive en `parcheDeResultadoIA`, que es quien escribe en la base.
    // Acá se perdían porque `normalize` arma un objeto nuevo campo por campo.
    momento: parsed?.momento ?? null,
    conciencia: parsed?.conciencia ?? null,
    hook_tipo: parsed?.hook_tipo ?? null,
  };
}

// Genera SOLO las notas ("cómo está hecho") con una llamada Claude mínima y barata
// (max_tokens bajo, texto plano). Para completar refs que ya tienen guion pero no notas.
async function notesOnly({ transcript, coverUrl }) {
  const block = coverUrl ? (await coverBlock(coverUrl)).block : null;
  const content = [];
  if (block) content.push(block);
  content.push({
    type: "text",
    text: `Escribí 2-4 frases sobre CÓMO ESTÁ HECHO este anuncio (guía para replicarlo): estructura, gancho, tono, formato. SOLO lo que se ve/oye — NO inventes.\n\nTranscripción:\n"""\n${(transcript || "(sin audio / transcripción vacía)").slice(0, 6000)}\n"""\n\nDevolvé SOLO las frases (sin JSON ni encabezados).`,
  });
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": ANTHROPIC_VERSION },
    body: JSON.stringify({
      model: MODEL, max_tokens: 320,
      system: "Sos un estratega creativo de performance. Escribís notas breves y accionables de cómo está hecho un anuncio, para replicarlo.",
      messages: [{ role: "user", content }],
    }),
  });
  if (!resp.ok) throw new Error(`Claude notas: ${await resp.text()}`);
  const data = await resp.json();
  return (data.content?.[0]?.text || "").trim() || null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY no configurada" });

  try {
    await requireTeamMemberOrWorker(req);
  } catch (err) {
    return sendAuthError(res, err);
  }

  const { sourceUrl, videoUrl, transcript: providedTranscript, coverUrl: providedCover, knownFormats = [], knownLabels = {}, imageOnly = false, forcedMarca = null, backupUrl = null, mode = null, references = null, formatName = null, text = null, headers = null, knownConcepts = [], adCopy = null } = req.body || {};

  try {
    // ── Modo parse_headers: normalizar encabezados de un documento a conceptos ──
    if (mode === "parse_headers" && Array.isArray(headers)) {
      if (!headers.length) return res.status(400).json({ error: "Sin encabezados." });
      const out = await parseHeaders({ headers, knownConcepts });
      return res.status(200).json({ ok: true, mode: "parse_headers", headers: out });
    }

    // ── Modo strategy_extract: sacar ángulos/objeciones/conciencia de un texto ──
    if (mode === "strategy_extract") {
      if (!text || !text.trim()) return res.status(400).json({ error: "Pegá el texto del plan para extraer la estrategia." });
      const out = await extractStrategy({ text });
      return res.status(200).json({ ok: true, mode: "strategy_extract", ...out });
    }

    // ── Modo synthesize: destilar el patrón de un FORMATO desde sus referencias ──
    if (mode === "synthesize" && Array.isArray(references)) {
      if (!references.length) return res.status(400).json({ error: "No hay referencias con contenido para sintetizar." });
      const out = await synthesizeFormat({ formatName, references });
      return res.status(200).json({ ok: true, mode: "synthesize", ...out });
    }

    // ── Modo transcript_only: Whisper (barato) + traducción a español si hace falta ──
    // Para completar el guion de refs del banco sin re-analizar todo el creativo. Si
    // Whisper detecta otro idioma, una llamada Claude mínima lo traduce al español.
    if (mode === "transcript_only") {
      if (!videoUrl) return res.status(400).json({ error: "Falta videoUrl" });
      let buf;
      try { buf = await downloadBuffer(videoUrl, { allowProxy: true }); }
      catch (e) { return res.status(200).json({ ok: false, reason: `descarga: ${e.message}` }); }
      if (!buf?.length || looksLikeHtml(buf)) return res.status(200).json({ ok: false, reason: "no se pudo bajar el video" });
      if (buf.length > WHISPER_LIMIT) return res.status(200).json({ ok: false, reason: "video supera 25MB" });
      let transcript = "";
      try { transcript = await transcribeToSpanish(buf); }
      catch (e) { return res.status(200).json({ ok: false, reason: `whisper: ${e.message}` }); }
      const noAudio = !transcript || !transcript.trim();
      return res.status(200).json({ ok: true, mode: "transcript_only", transcript: transcript || "", noAudio });
    }

    // ── Modo translate_es: traduce a español un guion ya guardado (si ya está en
    // español lo devuelve idéntico). Para reparar transcripciones en inglés del
    // banco sin re-analizar el creativo. Texto vacío → devuelve "" sin llamar a Claude. ──
    if (mode === "translate_es") {
      if (!text || !text.trim()) return res.status(200).json({ ok: true, mode: "translate_es", text: "" });
      const translated = await translateToSpanishIfNeeded(text);
      return res.status(200).json({ ok: true, mode: "translate_es", text: translated || text });
    }

    // ── Modo notes_only: 1 llamada Claude mínima para generar SOLO las notas ──
    if (mode === "notes_only") {
      const notes = await notesOnly({ transcript: providedTranscript, coverUrl: providedCover });
      return res.status(200).json({ ok: true, mode: "notes_only", notes });
    }

    // ── Modo texto (fallback): tenemos transcript y NO hay video ──
    // (Si hay videoUrl, preferimos el modo video para poder respaldar a Drive,
    // reusando este transcript sin re-transcribir.)
    if (providedTranscript && providedTranscript.trim() && !videoUrl) {
      const { block, buf } = await coverBlock(providedCover);
      const cover_url = await permanentCover(providedCover, buf);
      const parsed = await classifyWithClaude({ transcript: providedTranscript, imageBlock: block, knownFormats, knownLabels, mediaType: "video", adCopy });
      return res.status(200).json({ ok: true, mode: "text", cover_url, transcript: providedTranscript, ...normalize(parsed, knownFormats, forcedMarca, knownLabels || {}) });
    }

    // ── Modo imagen-sola: anuncio estático (o sin audio/video) — clasifica por la portada, sin tocar Meta ──
    if (imageOnly || (providedCover && !videoUrl && !sourceUrl)) {
      const { block, buf } = await coverBlock(providedCover);
      if (!block) {
        return res.status(200).json({ ok: false, needsFile: true, reason: "El anuncio no tiene portada para analizar." });
      }
      const cover_url = await permanentCover(providedCover, buf);
      const parsed = await classifyWithClaude({ transcript: "", imageBlock: block, knownFormats, knownLabels, mediaType: "unknown", adCopy });
      return res.status(200).json({ ok: true, mode: "image", cover_url, transcript: "", ...normalize(parsed, knownFormats, forcedMarca, knownLabels || {}) });
    }

    // ── Modo video directo: tenemos el mp4 (p.ej. de Foreplay) — sin tocar Meta ──
    if (videoUrl) {
      const warnings = [];
      // Si Foreplay ya trae transcripción, la reusamos (no re-transcribimos).
      let transcript = (providedTranscript || "").trim();
      let vidBuf = null;
      // Bajamos el video si necesitamos transcribir (Whisper) o RESPALDAR a Storage.
      // El respaldo se hace siempre que no venga ya un backupUrl → así todo creativo
      // nuevo queda con un mp4 permanente reproducible (los links de fbcdn expiran).
      const needBackup = !backupUrl;
      if (needBackup || process.env.OPENAI_API_KEY) {
        try { vidBuf = await downloadBuffer(videoUrl, { allowProxy: true }); }
        catch (e) { warnings.push(`No se pudo bajar el video (${e.message}).`); }
      } else if (!transcript) {
        warnings.push("OPENAI_API_KEY no configurada; se clasificó solo por la portada.");
      }
      // Si en vez del video bajamos una página HTML (Drive privado o interstitial
      // de "confirmar descarga"), no hay creativo que analizar → pedimos compartir.
      if (vidBuf && looksLikeHtml(vidBuf)) {
        return res.status(200).json({
          ok: false, needsFile: true,
          reason: backupUrl
            ? "El video de Drive es privado. Compartilo como 'Cualquiera con el link' (o subí el archivo)."
            : "No se pudo bajar el video del link.",
        });
      }
      // Solo transcribimos con Whisper si no vino ya la transcripción. El transcript
      // se fuerza a ESPAÑOL (traduce si Whisper detecta otro idioma).
      if (!transcript && vidBuf && process.env.OPENAI_API_KEY) {
        if (vidBuf.length <= WHISPER_LIMIT) { try { transcript = await transcribeToSpanish(vidBuf); } catch (e) { warnings.push(`No se pudo transcribir (${e.message}).`); } }
        else warnings.push("El video supera 25MB; se clasificó solo por la portada.");
      }
      const { block, buf: coverBuf } = await coverBlock(providedCover);
      const cover_url = await permanentCover(providedCover, coverBuf);
      const parsed = await classifyWithClaude({ transcript, imageBlock: block, knownFormats, knownLabels, mediaType: "video", adCopy });
      const norm = normalize(parsed, knownFormats, forcedMarca, knownLabels || {});
      // Respaldo PERSISTENTE del video: si YA vino un backupUrl (p.ej. link pegado por
      // Jose, o Supabase-bridge del navegador) lo reusamos; si no, subimos el mp4 ya
      // descargado a Storage. Best-effort: si falla, drive_url queda null (no rompe).
      const drive_url = backupUrl || await uploadVideoBackup(vidBuf, warnings);
      return res.status(200).json({ ok: true, mode: "video", cover_url, video_url: videoUrl, transcript, drive_url, warnings, ...norm });
    }

    // ── Modo auto: partimos del link de Facebook Ads Library ──
    if (!sourceUrl) return res.status(400).json({ error: "Falta sourceUrl o transcript" });

    let info;
    try {
      info = await fetchAdPage(sourceUrl);
    } catch (e) {
      return res.status(200).json({ ok: false, needsFile: true, reason: `El desbloqueador no pudo abrir Meta (${e.message}). Subí el video.` });
    }
    const html = info.html;
    // Diagnóstico: si el proxy no está configurado, o Meta bloqueó / mostró login.
    if (info.via === "directo") {
      return res.status(200).json({ ok: false, needsFile: true, reason: `Sin desbloqueador configurado (Meta bloquea al servidor). Subí el video.` });
    }
    if (info.status >= 400) {
      return res.status(200).json({ ok: false, needsFile: true, reason: `El desbloqueador (${info.via}) respondió ${info.status}. ${info.size < 2000 ? "Página vacía/bloqueada." : ""} Subí el video.` });
    }
    if (info.loginWall) {
      return res.status(200).json({ ok: false, needsFile: true, reason: `Meta pidió login al desbloqueador (${info.via}, ${Math.round(info.size / 1024)}KB). Subí el video.` });
    }
    const { video, image } = extractMedia(html);
    if (!video && !image) {
      return res.status(200).json({ ok: false, needsFile: true, reason: `Abrió la página (${info.via}, ${Math.round(info.size / 1024)}KB) pero no encontró el video del anuncio. Subí el video.` });
    }

    // Portada → bloque para Claude (base64 si se puede bajar, si no URL) + copia
    // persistente en Storage cuando la bajamos.
    let imageBlock = null, coverUrl = null;
    if (image) {
      const cb = await coverBlock(image);
      imageBlock = cb.block;
      if (cb.buf) { try { coverUrl = await uploadCover(cb.buf, sniffImageType(cb.buf)); } catch { coverUrl = null; } }
    }

    // Video → transcript (Whisper) + respaldo a Drive (si están configurados).
    let transcript = "";
    const warnings = [];
    let vidBuf = null;
    if (video && (process.env.OPENAI_API_KEY || driveEnabled())) {
      try { vidBuf = await downloadBuffer(video, { allowProxy: true }); }
      catch (e) { warnings.push(`No se pudo bajar el video (${e.message}).`); }
    } else if (video && !process.env.OPENAI_API_KEY) {
      warnings.push("OPENAI_API_KEY no configurada; se clasificó solo por la portada.");
    }
    if (vidBuf && process.env.OPENAI_API_KEY) {
      if (vidBuf.length <= WHISPER_LIMIT) { try { transcript = await transcribeToSpanish(vidBuf); } catch (e) { warnings.push(`No se pudo transcribir (${e.message}).`); } }
      else warnings.push("El video supera 25MB; se clasificó solo por la portada. Podés subir el archivo para transcribir.");
    }
    const pageName = extractPageName(html);
    const parsed = await classifyWithClaude({
      transcript, imageBlock, knownFormats, knownLabels,
      mediaType: video ? "video" : "static",
      advertiser: pageName,
    });
    const norm = normalize(parsed, knownFormats, forcedMarca, knownLabels || {});
    // Fallback: si la IA no sacó marca y hay anunciante, usar el anunciante (canónico).
    if (!norm.suggested_labels?.marca?.length && pageName) {
      norm.suggested_labels = { ...norm.suggested_labels, marca: [canonicalBrand(pageName, knownLabels?.marca || [])] };
    }
    const drive_url = await maybeUploadToDrive(vidBuf, { marca: norm.suggested_labels?.marca?.[0], format: norm.suggested_format, stage: norm.suggested_stage }, warnings);

    return res.status(200).json({
      ok: true, mode: "auto",
      cover_url: coverUrl,
      video_url: video || null,
      transcript,
      drive_url,
      warnings,
      ...norm,
    });
  } catch (err) {
    console.error("classify-ad error:", err);
    return res.status(500).json({ error: err?.message || String(err) });
  }
}
