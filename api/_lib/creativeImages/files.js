import { safeExternalFetch, readResponseBuffer } from '../safeUrl.js';
import { detectMediaType } from '../adLibrary/media.js';
import { AuthError } from '../auth.js';

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export async function receiveImage(file, fetchImpl = safeExternalFetch) {
  if (!file || typeof file.file_id !== 'string' || !file.file_id || file.file_id.length > 200
    || typeof file.download_url !== 'string' || file.download_url.length > 8192) throw new AuthError(400, 'Archivo inválido');
  // Never use file_id or file_name as a path. Validate DNS/redirects and pin the public IP via safeExternalFetch.
  let url;
  try { url = new URL(file.download_url); } catch { throw new AuthError(400, 'Enlace de archivo inválido'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new AuthError(400, 'El archivo necesita un enlace HTTPS');
  const response = await fetchImpl(url.href, { signal: AbortSignal.timeout(45_000) }, { timeoutMs: 45_000 });
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new AuthError(422, 'El enlace del archivo venció o no permite la descarga; vuelve a adjuntar la imagen');
  }
  if (Number(response.headers.get('content-length')) > MAX_IMAGE_BYTES) {
    await response.body?.cancel().catch(() => {});
    throw new AuthError(413, 'La imagen supera 20 MB');
  }
  const buffer = await readResponseBuffer(response, MAX_IMAGE_BYTES);
  const mimeType = detectMediaType(buffer);
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(mimeType)) throw new AuthError(415, 'Usa una imagen PNG, JPG o WebP');
  return { buffer, mimeType };
}
