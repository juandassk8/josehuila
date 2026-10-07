import { randomUUID } from 'node:crypto';
import { AuthError, serviceClient } from '../auth.js';
import { crawlQueue, commandsRedis } from './queue.js';
import { parseBrandInput } from './brandIdentity.js';

const messages = {
  BRAND_WEBSITE_NO_FANPAGE: 'No encontramos un enlace a Facebook en este sitio. Pega la URL de su fanpage o de su biblioteca de anuncios.',
  BRAND_WEBSITE_UNAVAILABLE: 'No pudimos leer ese sitio web. Prueba con el enlace de la fanpage.',
  META_ACCESS_REQUIRED: 'Meta pide iniciar sesión para ver esa página. Prueba con su enlace de la biblioteca de anuncios.',
  BRAND_IDENTITY_NOT_FOUND: 'No pudimos confirmar el nombre y el ID de esa fanpage. Revisa el enlace o usa el de su biblioteca de anuncios.',
};
function cachedIdentity(brand) {
  return brand && brand.name && !brand.name.startsWith('Página ') ? { state: 'completed', candidates: [{
    pageId: brand.meta_page_id, name: brand.name, fanpageUrl: `https://www.facebook.com/profile.php?id=${brand.meta_page_id}`,
    libraryUrl: `https://www.facebook.com/ads/library/?view_all_page_id=${brand.meta_page_id}`,
  }], cached: true } : null;
}
export async function requestResolution(companyId, userId, raw, { queue = crawlQueue(), redis = commandsRedis(), client } = {}) {
  let input;
  try { input = parseBrandInput(raw); } catch { throw new AuthError(400, 'Pega una URL de la web, de la fanpage o de la biblioteca de anuncios de la marca.'); }
  if (input.pageId) {
    const known = await (client || serviceClient()).from('ad_library_brands').select('id,name,meta_page_id').eq('meta_page_id', input.pageId)
      .eq('source', process.env.ADLIB_COLLECTOR || 'meta_web').limit(1);
    if (known.error) throw Error('BRAND_CATALOG_UNAVAILABLE');
    const brand = known.data?.[0];
    if (cachedIdentity(brand)) return { resolutionId: `catalog-${brand.id}` };
  }
  const existingId = await redis.get(`adlib:resolve:${userId}`);
  const existing = existingId ? await queue.getJob(existingId) : null;
  if (existing && !['completed', 'failed'].includes(await existing.getState())) {
    if (existing.data.companyId === companyId && existing.data.url === input.url) return { resolutionId: existing.id };
    throw new AuthError(429, 'Ya hay una búsqueda pendiente. Espera a que termine antes de buscar otra marca.');
  }
  const id = `resolve-${randomUUID()}`;
  if (!await redis.set(`adlib:resolve-lock:${userId}`, '1', 'EX', 30, 'NX')) throw new AuthError(429, 'Espera unos segundos antes de buscar otra marca.');
  const job = await queue.add('resolve-brand', { companyId, userId, url: input.url }, {
    jobId: id, priority: 1, attempts: 1, removeOnComplete: { age: 86400, count: 1000 }, removeOnFail: { age: 86400, count: 1000 },
  });
  await redis.set(`adlib:resolve:${userId}`, job.id, 'EX', 86400);
  return { resolutionId: job.id };
}
export async function getResolution(companyId, userId, id, { queue = crawlQueue(), client } = {}) {
  // Catalog identities are public, shared metadata, with company permission checked by the API.
  if (/^catalog-[0-9a-f-]{36}$/.test(String(id || ''))) {
    const known = await (client || serviceClient()).from('ad_library_brands').select('id,name,meta_page_id').eq('id', id.slice(8)).maybeSingle();
    if (known.error) throw Error('BRAND_CATALOG_UNAVAILABLE');
    const identity = cachedIdentity(known.data);
    if (!identity) throw new AuthError(404, 'Fanpage no disponible. Vuelve a buscarla.');
    return identity;
  }
  if (!/^resolve-[0-9a-f-]{36}$/.test(String(id || ''))) throw new AuthError(400, 'Búsqueda inválida');
  const job = await queue.getJob(id);
  if (!job || job.name !== 'resolve-brand' || job.data.companyId !== companyId || job.data.userId !== userId) throw new AuthError(404, 'Búsqueda no disponible. Vuelve a pegar el enlace.');
  const state = await job.getState();
  if (state === 'completed') return { state, ...job.returnvalue };
  if (state === 'failed') return { state, error: messages[job.failedReason] || 'No pudimos consultar la marca. Prueba con su enlace de la biblioteca de anuncios.' };
  const ttl = await queue.getRateLimitTtl();
  return { state: state === 'active' ? 'active' : 'waiting', retryAt: ttl > 0 ? new Date(Date.now() + ttl).toISOString() : null, paused: await queue.isPaused() };
}
