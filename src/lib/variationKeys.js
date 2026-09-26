// Identidad de un referente ACROSS BOARDS.
//
// El mismo anuncio vive en varias filas: la del banco general y una copia por
// cada cliente al que se lo importaste. Son filas distintas con ids distintos, y
// no hay FK entre ellas — así que la identidad se deduce de lo que comparten:
// el id del anuncio de Meta, el archivo de video y el archivo de portada.
//
// Estas claves ya existían dentro de concept_bank/db.js (las usan el import y el
// dedup). Se sacaron acá porque ahora también las necesita la propagación de
// portadas, y `src/despliegue/` no puede importar de `src/team/`.

const GENERIC_BASENAME = new Set(["uc", "view", "preview", "edit", "open", "download", "index"]);

// Nombre de archivo estable de una URL. Para Drive usa el id (la ruta es
// siempre ".../uc" o ".../view" y no distingue nada).
export function fileKey(u) {
  if (!u || typeof u !== "string") return null;
  if (/drive\.google\.com|docs\.google\.com/i.test(u)) {
    const m = u.match(/\/d\/([\w-]{20,})|[?&]id=([\w-]{20,})/);
    return m ? `drive:${m[1] || m[2]}` : null;
  }
  let base;
  try { base = new URL(u).pathname.split("/").pop(); } catch { base = u.split("?")[0].split("/").pop(); }
  base = (base || "").toLowerCase().trim();
  if (base.length < 6) return null;
  if (GENERIC_BASENAME.has(base.replace(/\.[a-z0-9]+$/, ""))) return null;
  return base;
}

export const metaIdFromUrl = (u) => {
  const m = (u || "").match(/[?&]id=(\d{5,})/);
  return m ? m[1] : null;
};

// Todas las claves por las que esta fila puede reconocerse en otro board.
// Comparten al menos una ⇒ son el mismo anuncio.
//
// OJO: NO se usa la URL de Meta como clave — el id va en el query y el prefijo
// `facebook.com/ads/library/` es idéntico para todos, así que juntaría TODO.
export function variationKeys(v) {
  const keys = [];
  const adId = v?.meta_ad_id || metaIdFromUrl(v?.meta_ads_library_url);
  if (adId) keys.push(`ad:${adId}`);
  const vk = fileKey(v?.drive_url); if (vk) keys.push(`vid:${vk}`);
  const ck = fileKey(v?.file_url); if (ck) keys.push(`cov:${ck}`);
  return keys;
}

// Claves que NO dependen de la portada. Para propagar portadas hay que
// emparejar por el anuncio o por el video: usar `cov:` sería circular (solo
// encontraría las que ya comparten portada, que son justo las que no hay que
// arreglar).
export function identityKeys(v) {
  const keys = [];
  const adId = v?.meta_ad_id || metaIdFromUrl(v?.meta_ads_library_url);
  if (adId) keys.push(`ad:${adId}`);
  const vk = fileKey(v?.drive_url); if (vk) keys.push(`vid:${vk}`);
  return keys;
}
