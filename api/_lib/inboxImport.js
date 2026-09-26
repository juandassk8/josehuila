// Importación de anuncios a la bandeja — lógica compartida entre navegador y servidor.
//
// ⚠️ ESTE ARCHIVO CORRE EN LOS DOS LADOS. No importes `node:*`, no uses
// `Buffer`, no toques `import.meta.env`, y no importes nada de `src/lib/`
// (logger y database usan `import.meta.env` y revientan en Node).
//
// Todo lo que dependa del entorno entra por parámetro: el cliente de Supabase,
// quién es el usuario, cómo se rehospedan las portadas, adónde van los errores.
// El navegador pasa el cliente anon con RLS; el worker pasa el service_role.
// Las tres consultas de dedupe son idénticas en ambos lados, y esa es la razón
// por la que esto se puede compartir en absoluto.

const TABLE = "reference_inbox";

// Solo aceptamos links de la Biblioteca de Anuncios de Meta.
export function isFacebookAdsLibrary(url) {
  return /facebook\.com\/ads\/library/i.test(url || "");
}

export const adIdFromMetaUrl = (u) => {
  const m = (u || "").match(/[?&]id=(\d{5,})/);
  return m ? m[1] : null;
};

// El nombre del archivo, sin el querystring: fbcdn firma cada URL distinto pero
// el archivo es el mismo.
const fileKey = (u) => {
  if (!u) return null;
  try { return new URL(u).pathname.split("/").pop() || null; }
  catch { return u.split("?")[0].split("/").pop() || null; }
};

// La huella de un creativo: marca + archivo.
//
// Es lo que distingue "otro anuncio" de "el mismo anuncio otra vez". Meta le da
// un `ad_id` nuevo a cada campaña, así que una marca corriendo el mismo video en
// cinco campañas produce cinco ids distintos y un solo creativo.
//
// Para un VIDEO sin `video_url` la huella queda vacía a propósito, en vez de caer
// a la portada: hay videos distintos que comparten thumbnail, y ahí un falso
// positivo borra trabajo real. Pagar un análisis de más es más barato que perder
// un creativo.
export function claveCreativo(a) {
  const marca = (a?.brand || "").trim().toLowerCase();
  const esVideo = !!a?.video_url || a?.media_type === "video";
  const archivo = a?.video_url ? fileKey(a.video_url) : (esVideo ? null : fileKey(a?.cover_url));
  return archivo ? `${marca}|${archivo}` : null;
}

// El copy del anuncio, normalizado. Dos anuncios que comparten marca y texto
// son el mismo creativo corriendo en varias campañas: Meta les da ad_id
// distinto y a veces re-codifica la portada, pero el copy no cambia.
//
// Se corta a 300 caracteres porque el final suele traer hashtags y disclaimers
// que sí varían entre campañas.
export function claveCopy(a) {
  const marca = (a?.brand || "").trim().toLowerCase();
  const t = String(a?.body || a?.title || "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 300);
  // Menos de 40 caracteres no distingue nada: "Envío gratis" lo dicen todos.
  return t.length >= 40 ? `${marca}|${t}` : null;
}

export function dedupeAds(ads, { seen = new Set(), seenAdIds = new Set(), seenCreativos = new Set(), incluirCopias = false } = {}) {
  const freshSeen = new Set(), freshAdIds = new Set(), creativeSeen = new Set(), copySeen = new Set();
  const fresh = [];
  let yaEstaban = 0, copias = 0;

  for (const a of ads || []) {
    const adId = a.external_id || adIdFromMetaUrl(a.source_url) || null;
    const id = adId ? String(adId) : null;

    if ((id && seenAdIds.has(id)) || seen.has(a.source_url)) { yaEstaban++; continue; }
    // Repetido dentro del propio lote por identidad: es literalmente el mismo anuncio.
    if ((id && freshAdIds.has(id)) || freshSeen.has(a.source_url)) { yaEstaban++; continue; }

    const creativo = claveCreativo(a);
    // Contra lo YA importado y contra la propia tanda. Lo primero es lo que
    // faltaba: la huella solo se comparaba dentro del lote, así que reimportar
    // una marca traía de nuevo todos sus creativos con ad_id nuevo — y cada uno
    // se transcribía y clasificaba otra vez.
    if (!incluirCopias && creativo && (seenCreativos.has(creativo) || creativeSeen.has(creativo))) { copias++; continue; }

    // Y por copy, dentro del lote. Agarra lo que la clave de archivo no puede:
    // el mismo creativo re-codificado por Meta, y los estáticos sin video del
    // que sacar un nombre de archivo.
    const copy = claveCopy(a);
    if (!incluirCopias && copy && copySeen.has(copy)) { copias++; continue; }

    if (id) freshAdIds.add(id);
    freshSeen.add(a.source_url);
    if (creativo) creativeSeen.add(creativo);
    if (copy) copySeen.add(copy);
    fresh.push(a);
  }
  return { fresh, yaEstaban, copias };
}

/**
 * Salida cruda de Apify → forma de "ad" que entiende `importAds`.
 * Era el `.map()` de dentro de `discoverBrandTopAds`; se separa para que el
 * worker pueda mapear lo que ya scrapeó sin volver a llamar a Apify.
 */
export function parseDiscoverAds(results, { brand = "", topN = 100, mediaOnly = null } = {}) {
  let filas = (results || []).filter((r) => r.ad_id && (r.video_url || r.image_url));
  if (mediaOnly === "video") filas = filas.filter((r) => r.video_url);
  else if (mediaOnly === "static") filas = filas.filter((r) => !r.video_url && r.image_url);

  const top = filas.slice(0, topN);   // orden natural de Meta, sin ranking por antigüedad
  const ads = top.map((r) => ({
    source_url: r.ad_library_url,
    video_url: r.video_url || null,
    cover_url: r.image_url || null,
    brand: r.page_name || brand,
    media_type: r.media_type,
    transcript: null,
    external_id: r.ad_id,
    // El copy del anuncio. Apify ya lo trae y se estaba tirando. Sirve para dos
    // cosas: dedupear sin pagar nada (dos copias del mismo creativo comparten el
    // texto) y darle contexto real a la IA — hoy un estático sin transcripción
    // se clasifica mirando solo la imagen, teniendo el copy al lado.
    body: r.body || null,
    title: r.title || null,
    days_running: r.start_date ? Math.round((Date.now() / 1000 - r.start_date) / 86400) : null,
    copies: r.copies ?? null,     // nº de copias activas del anuncio (señal de ganador)
    live: r.is_active,
  }));
  return { ads, totalFound: filas.length, brand: top[0]?.page_name || brand };
}

/**
 * Mete anuncios en la bandeja, dedupeando contra bandeja y banco.
 *
 * Es idempotente: si se corta a la mitad y se vuelve a llamar con la misma
 * lista, los ya insertados se saltan y entran solo los que faltaban. De eso
 * depende que el worker pueda reanudar un tick caído sin duplicar nada.
 *
 * @param sb            cliente de Supabase — anon+RLS en el navegador, service_role en el worker
 * @param createdBy     uuid del autor; el worker lo saca del job, no hay sesión
 * @param importJobId   para poder recontar después qué falta clasificar de este job
 * @param rehostCovers  (urls, {onProgress}) => Promise<Map<orig,nueva>>; el navegador
 *                      no puede bajar de fbcdn (CORS + Referer), el worker sí
 * @param onError       adónde van los fallos de mejor esfuerzo (no se importa el logger)
 */
export async function importAds(sb, ads, {
  companyId = null,
  pipelineType = "ads",
  incluirCopias = false,
  createdBy = null,
  importJobId = null,
  rehostCovers = null,
  onProgress = null,
  onError = null,
} = {}) {
  const clean = (ads || []).filter((a) => a?.source_url);
  if (clean.length === 0) return { created: [], skipped: 0, yaEstaban: 0, copias: 0 };

  // El AD_ID de Meta es la clave ESTABLE del anuncio (a diferencia del source_url
  // completo y de las URLs de fbcdn del video/portada, que cambian de scrape en
  // scrape con tokens nuevos). Dedupeamos por ad_id contra la BANDEJA y contra el
  // BANCO, para no volver a traer un anuncio que ya está en cualquiera de los dos.
  const adIdOf = (a) => a.external_id || adIdFromMetaUrl(a.source_url) || null;
  const seen = new Set();       // source_urls ya en la bandeja
  const seenAdIds = new Set();  // ad_ids ya presentes (bandeja + banco)

  const urls = [...new Set(clean.map((a) => a.source_url))];
  for (let i = 0; i < urls.length; i += 80) {
    const batch = urls.slice(i, i + 80);
    const { data: existing, error: exErr } = await sb.from(TABLE).select("source_url").in("source_url", batch);
    if (exErr) throw exErr;
    for (const r of existing || []) { seen.add(r.source_url); const id = adIdFromMetaUrl(r.source_url); if (id) seenAdIds.add(String(id)); }
  }

  // Banco: variaciones cuyo meta_ads_library_url contiene alguno de los ad_ids que
  // vamos a importar (o cuyo meta_ad_id coincide). Filtro dirigido por ad_id.
  // Solo ids "seguros" (alfanumérico/guion) → no rompen el filtro or() de PostgREST.
  const incomingAdIds = [...new Set(clean.map(adIdOf).filter(Boolean).map(String).filter((id) => /^[A-Za-z0-9_-]+$/.test(id)))];
  for (let i = 0; i < incomingAdIds.length; i += 50) {
    const batch = incomingAdIds.slice(i, i + 50);
    const orFilter = batch.map((id) => `meta_ads_library_url.ilike.*${id}*`).join(",");
    try {
      const { data: bankRows } = await sb
        .from("despliegue_variations").select("meta_ads_library_url, meta_ad_id").or(orFilter).limit(2000);
      for (const v of bankRows || []) {
        const id = (v.meta_ad_id && String(v.meta_ad_id)) || adIdFromMetaUrl(v.meta_ads_library_url);
        if (id) seenAdIds.add(String(id));
      }
    } catch (e) { onError?.("dedup banco por ad_id falló", e); /* best-effort: seguimos con dedup por source_url */ }
  }

  // Huellas de creativo ya importadas. Esto es lo que evita volver a pagar
  // Whisper y Claude por un video que ya analizamos con otro ad_id.
  const seenCreativos = new Set();
  if (!incluirCopias) {
    const entrantes = [...new Set(clean.map(claveCreativo).filter(Boolean))];
    for (let i = 0; i < entrantes.length; i += 80) {
      const batch = entrantes.slice(i, i + 80);
      try {
        const { data } = await sb.from(TABLE).select("creative_key").in("creative_key", batch);
        for (const r of data || []) if (r.creative_key) seenCreativos.add(r.creative_key);
      } catch (e) {
        // Mejor esfuerzo: si la columna todavía no existe o la consulta falla,
        // se sigue con el dedupe de siempre en vez de bloquear la importación.
        onError?.("dedup por huella de creativo falló", e);
      }
    }
  }

  const primera = dedupeAds(clean, { seen, seenAdIds, seenCreativos, incluirCopias });
  let { fresh } = primera;
  let { yaEstaban, copias } = primera;
  if (fresh.length === 0) return { created: [], skipped: yaEstaban + copias, yaEstaban, copias };

  // Las portadas se blindan ACÁ, con la URL todavía viva. Hacerlo al cargar al
  // banco llegaba tarde: para entonces Meta ya las había expirado.
  //
  // Y se hace ANTES del segundo dedupe a propósito: bajar la imagen es lo que
  // da su huella, y la huella es lo único que reconoce dos copias del mismo
  // creativo. Una vez subidas, cada copia tiene una URL distinta y ya no hay
  // nada que comparar.
  const huellas = new Map();
  const portadas = rehostCovers
    ? await rehostCovers(fresh.map((a) => a.cover_url), { onProgress, huellas })
    : new Map();

  // Segundo dedupe, por imagen. Acá es donde se cortan las cinco copias del
  // mismo anuncio que Meta devuelve con ad_ids y nombres de archivo distintos —
  // antes de transcribirlas y clasificarlas cinco veces.
  if (huellas.size) {
    const yaEnBase = new Set();
    const entrantes = [...new Set([...huellas.values()])];
    for (let i = 0; i < entrantes.length; i += 80) {
      const batch = entrantes.slice(i, i + 80);
      for (const tabla of [TABLE, "despliegue_variations"]) {
        try {
          const { data } = await sb.from(tabla).select("cover_hash").in("cover_hash", batch);
          for (const r of data || []) if (r.cover_hash) yaEnBase.add(r.cover_hash);
        } catch (e) { onError?.(`dedupe por huella de portada en ${tabla} falló`, e); }
      }
    }

    const vistas = new Set();
    const sobreviven = [];
    for (const a of fresh) {
      const h = huellas.get(a.cover_url);
      // Sin huella (no se pudo bajar) pasa igual: mejor analizar de más que
      // perder un creativo por una descarga fallida.
      if (!incluirCopias && h && (yaEnBase.has(h) || vistas.has(h))) { copias++; continue; }
      if (h) vistas.add(h);
      sobreviven.push(a);
    }
    fresh = sobreviven;
  }

  const skipped = yaEstaban + copias;
  if (fresh.length === 0) return { created: [], skipped, yaEstaban, copias };

  const rows = fresh.map((a) => ({
    source_url: a.source_url,
    source_platform: isFacebookAdsLibrary(a.source_url) ? "meta" : "other",
    status: "pending",
    company_id: companyId || null,
    pipeline_type: pipelineType || "ads",
    note: null,
    created_by: createdBy,
    source_kind: "foreplay",
    suggested_media_type: a.media_type || null,
    suggested_labels: a.brand ? { marca: [a.brand] } : {},
    // La huella se guarda con la URL de fbcdn TODAVÍA original: abajo la portada
    // se rehospeda y el video se respalda, y ahí ya se pierde el nombre de
    // archivo que identifica al creativo.
    creative_key: claveCreativo(a),
    ad_copy: a.body || a.title || null,
    cover_hash: huellas.get(a.cover_url) || null,
    cover_url: portadas.get(a.cover_url) || a.cover_url || null,
    transcript: a.transcript || null,
    ...(importJobId ? { import_job_id: importJobId } : {}),
    // Guardamos longevidad (días corriendo) + video para mostrar y respaldar.
    ai_raw: {
      video_url: a.video_url || null,
      external_id: a.external_id || null,
      days_running: a.days_running ?? null,
      copies: a.copies ?? null,     // nº de copias activas (señal de ganador) — antes se descartaba
      live: a.live ?? null,
    },
  }));

  const { data, error } = await sb.from(TABLE).insert(rows).select();
  if (error) throw error;
  return { created: data || [], skipped, yaEstaban, copias };
}
