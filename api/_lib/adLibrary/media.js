import { safeExternalFetch, readResponseBuffer } from '../safeUrl.js';
import { mediaSource } from './metaWeb.js';

export function detectMediaType(buffer) {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (/^GIF8[79]a/.test(buffer.subarray(0, 6).toString())) return 'image/gif';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buffer.toString('ascii', 4, 8) === 'ftyp') return /avif|avis/.test(buffer.toString('ascii', 8, 32)) ? 'image/avif' : 'video/mp4';
  if (buffer.subarray(0, 4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]))) return 'video/webm';
  return null;
}

export async function downloadCreative(asset, { fetchImpl = safeExternalFetch, maxBytes = 100 * 1024 * 1024 } = {}) {
  const validated = mediaSource(asset.url, asset.kind);
  if (!validated || !['image', 'video'].includes(asset.kind) || validated.sourceKey !== asset.sourceKey) throw new Error('MEDIA_SOURCE_INVALID');
  const response = await fetchImpl(asset.url, { signal: AbortSignal.timeout(90_000) }, { timeoutMs: 90_000 });
  if (!response.ok) { await response.body?.cancel().catch(() => {}); throw new Error(`MEDIA_HTTP_${response.status}`); }
  const buffer = await readResponseBuffer(response, maxBytes);
  const mimeType = detectMediaType(buffer);
  if (!mimeType || !mimeType.startsWith(`${asset.kind}/`)) throw new Error('MEDIA_TYPE_INVALID');
  return { buffer, mimeType };
}
