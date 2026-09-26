// Blinda portadas: baja la imagen de fbcdn y la guarda en nuestro Storage.
//
// Las portadas que trae Apify apuntan a fbcdn, y Meta las expira en días. Cuando
// caducan devuelven 403 y ya no hay forma de recuperarlas — verificado: de 1.905
// portadas rotas en el banco, ninguna se puede volver a bajar. Por eso se hace al
// IMPORTAR, que es el único momento en que la URL está viva con seguridad.
//
// Va en el servidor porque fbcdn exige `Referer` de Facebook y un User-Agent de
// browser; desde la página, además, CORS lo bloquea.
//
// Solo servidor: usa `Buffer` y el service_role. NO importar desde `src/`.

import { createHash } from "node:crypto";
import { serviceClient } from "./auth.js";
import { readResponseBuffer, safeExternalFetch } from "./safeUrl.js";

const BUCKET = "despliegue-examples";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
export const MAX_URLS = 30;          // por request; el cliente manda de a tandas
const MAX_BYTES = 8 * 1024 * 1024;

export const esPropia = (u) => /database\.co\/storage|\/storage\/v1\//i.test(u || "");

export function sniffImageType(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50) return "image/png";
  if (buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return "image/webp";
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "image/gif";
  return null;
}

export async function bajar(url) {
  const resp = await safeExternalFetch(url, {
    headers: { "User-Agent": UA, Referer: "https://www.facebook.com/", Accept: "image/*,*/*" },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const buf = await readResponseBuffer(resp, MAX_BYTES);
  if (!buf.length) throw new Error("vacía");
  if (!sniffImageType(buf)) throw new Error("el recurso no es una imagen admitida");
  return buf;
}

export async function subir(buf) {
  const tipo = sniffImageType(buf);
  if (!tipo) throw new Error("imagen no válida");
  const ext = tipo.includes("png") ? "png" : tipo.includes("webp") ? "webp" : tipo.includes("gif") ? "gif" : "jpg";
  const path = `bank-covers/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const sb = serviceClient();
  const { error } = await sb.storage.from(BUCKET).upload(path, buf, { contentType: tipo, cacheControl: "31536000", upsert: false });
  if (error) throw error;
  return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * Huella de la imagen. Se calcula sobre los bytes originales de fbcdn, ANTES de
 * subirla: una vez en nuestro Storage cada copia tiene una URL distinta y ya no
 * hay forma de ver que son la misma.
 */
export function huellaDeImagen(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * Blinda una tanda. Devuelve `{ orig → nueva|null }`.
 * Mejor esfuerzo: la que no se pueda bajar queda en null y el que llama
 * conserva la original — una portada dudosa es mejor que ninguna.
 */
export async function rehostTanda(urls) {
  const pares = await Promise.all((urls || []).map(async (u) => {
    const url = String(u || "").trim();
    if (!url) return [u, null, null];
    if (esPropia(url)) return [u, url, null];   // ya es nuestra
    try {
      const buf = await bajar(url);
      return [u, await subir(buf), huellaDeImagen(buf)];
    } catch { return [u, null, null]; }
  }));
  return pares;
}

/**
 * La misma firma que `blindarPortadas` del navegador, para que `importAds`
 * reciba una u otra sin enterarse: `(urls, {onProgress}) => Map<orig,nueva>`.
 *
 * Acá se hace en proceso; en el navegador va por HTTP contra /api/rehost-covers.
 */
export async function rehostCovers(urls, { onProgress = null, huellas = null } = {}) {
  const pendientes = [...new Set((urls || []).filter(Boolean).map(String))];
  const mapa = new Map();
  for (let i = 0; i < pendientes.length; i += MAX_URLS) {
    const tanda = pendientes.slice(i, i + MAX_URLS);
    onProgress?.(`Guardando portadas ${Math.min(i + tanda.length, pendientes.length)}/${pendientes.length}…`);
    for (const [orig, nueva, hash] of await rehostTanda(tanda)) {
      if (nueva) mapa.set(orig, nueva);
      if (hash && huellas) huellas.set(orig, hash);
    }
  }
  return mapa;
}
