import { createHash, randomUUID } from 'node:crypto';
import { AuthError, serviceClient } from '../auth.js';
import { parseBrandInput } from './brandIdentity.js';
import { crawlQueue, enqueueBrand } from './queue.js';

const TABLE = 'ad_library_brand_requests';
const columns = 'id,company_id,input_url,status,candidates,brand_id,attempts,next_attempt_at,last_error,created_at,updated_at';
const value = result => { if (result.error) throw Error('BRAND_REQUEST_DATABASE_UNAVAILABLE'); return result.data; };
const validId = id => /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(String(id || ''));
export function publicBrandRequest(row) {
  return { id: row.id, url: row.input_url, status: row.status, brandId: row.brand_id,
    candidates: row.status === 'needs_selection' ? row.candidates : [], createdAt: row.created_at, updatedAt: row.updated_at };
}
export async function enqueueBrandRequest(id, { queue = crawlQueue() } = {}) {
  return queue.add('resolve-brand-request', { requestId: id }, { jobId: `request-${id}`, priority: 2, attempts: 1,
    removeOnComplete: true, removeOnFail: true });
}
// Catalogue reads do not contact Meta and must not wait behind its rate limiter.
export async function resolveKnownBrandRequest(row, { client = serviceClient(), complete = completeBrandRequest } = {}) {
  if (row.status !== 'pending') return row;
  const input = parseBrandInput(row.input_url);
  if (!input.pageId) return row;
  const known = value(await client.from('ad_library_brands').select('name,meta_page_id')
    .eq('source', process.env.ADLIB_COLLECTOR || 'meta_web').eq('meta_page_id', input.pageId).eq('country', 'ALL').limit(1))[0];
  if (!known?.name || known.name.startsWith('Página ')) return row;
  const candidates = [{ pageId: known.meta_page_id, name: known.name,
    fanpageUrl: `https://www.facebook.com/profile.php?id=${known.meta_page_id}` }];
  const saved = value(await client.from(TABLE).update({ status: 'needs_selection', candidates, last_error: null,
    lease_token: null, lease_until: null, updated_at: new Date().toISOString() })
    .eq('id', row.id).eq('company_id', row.company_id).eq('status', 'pending').select('id'));
  if (saved.length) {
    try { await complete(row.company_id, row.id, input.pageId, { client }); }
    catch (error) { if (error.status !== 409) throw error; } // Cancellation wins the race.
  }
  return value(await client.from(TABLE).select(columns).eq('id', row.id).eq('company_id', row.company_id).single());
}
export async function createBrandRequest(companyId, userId, raw, { client = serviceClient(), enqueue = enqueueBrandRequest,
  resolveKnown = resolveKnownBrandRequest } = {}) {
  let input;
  try { input = parseBrandInput(raw); } catch { throw new AuthError(400, 'Pega un enlace válido del sitio web, fanpage o biblioteca de anuncios.'); }
  const hash = createHash('sha256').update(input.url).digest('hex');
  value(await client.from(TABLE).upsert({ company_id: companyId, created_by: userId, input_url: input.url, url_hash: hash },
    { onConflict: 'company_id,url_hash', ignoreDuplicates: true }));
  let row = value(await client.from(TABLE).select(columns).eq('company_id', companyId).eq('url_hash', hash).single());
  if (row.status === 'cancelled') {
    const reopened = value(await client.from(TABLE).update({ status: 'pending', candidates: [], brand_id: null, attempts: 0,
      next_attempt_at: new Date().toISOString(), last_error: null, lease_token: null, lease_until: null, updated_at: new Date().toISOString() })
      .eq('id', row.id).eq('company_id', companyId).eq('status', 'cancelled').select(columns));
    row = reopened[0] || row;
  }
  row = await resolveKnown(row, { client });
  // The durable record is the acknowledgement. Redis outages cannot lose the intention.
  if (row.status === 'pending') try { await enqueue(row.id); } catch { /* Scheduler retries delivery. */ }
  if (row.status === 'ready') {
    // Re-follow after a previous pause without requiring the source to resolve again.
    value(await client.from('ad_library_follows').update({ active: true }).eq('company_id', companyId).eq('brand_id', row.brand_id));
  }
  return { request: publicBrandRequest(row), saved: true };
}
export async function listBrandRequests(companyId, { client = serviceClient(), admin = false } = {}) {
  let query = client.from(TABLE).select(columns);
  if (!admin) query = query.eq('company_id', companyId);
  const rows = value(await query.in('status', ['pending', 'resolving', 'needs_selection']).order('created_at', { ascending: false }).limit(500));
  return admin ? rows : rows.map(publicBrandRequest);
}
export async function cancelBrandRequest(companyId, id, { client = serviceClient() } = {}) {
  if (!validId(id)) throw new AuthError(400, 'Solicitud inválida');
  const rows = value(await client.from(TABLE).update({ status: 'cancelled', lease_token: null, lease_until: null, updated_at: new Date().toISOString() })
    .eq('id', id).eq('company_id', companyId).in('status', ['pending', 'resolving', 'needs_selection']).select('id'));
  if (!rows.length) throw new AuthError(409, 'La solicitud ya cambió. Actualiza la biblioteca para ver su estado.');
  return { ok: true };
}
export async function completeBrandRequest(companyId, id, pageId, { client = serviceClient(), enqueue = enqueueBrand } = {}) {
  if (!validId(id) || !/^\d{5,25}$/.test(String(pageId || ''))) throw new AuthError(400, 'Elige una de las fanpages encontradas.');
  const result = await client.rpc('ad_library_complete_brand_request', { p_id: id, p_company: companyId, p_page: pageId,
    p_source: process.env.ADLIB_COLLECTOR || 'meta_web' });
  if (result.error?.code === '22023') throw new AuthError(409, 'La solicitud cambió. Actualiza para elegir su fanpage.');
  const completed = value(result);
  try { await enqueue(completed.brandId, { reason: 'first_import' }); } catch { /* Existing due-brand scheduler recovers. */ }
  return completed;
}
export async function scheduleBrandRequests(client = serviceClient(), enqueue = enqueueBrandRequest, resolveKnown = resolveKnownBrandRequest) {
  const now = new Date().toISOString();
  // Including future retries: a verified catalogue identity needs no source retry.
  const waiting = value(await client.from(TABLE).select(columns).eq('status', 'pending').order('created_at').limit(500));
  for (const row of waiting) await resolveKnown(row, { client });
  const pending = value(await client.from(TABLE).select('id').eq('status', 'pending').lte('next_attempt_at', now).order('next_attempt_at').limit(100));
  const stale = value(await client.from(TABLE).select('id').eq('status', 'resolving').lt('lease_until', now).order('lease_until').limit(100));
  for (const row of [...pending, ...stale]) await enqueue(row.id);
  // Recover the small crash window between saving candidates and creating a follow.
  const resolved = value(await client.from(TABLE).select('id,company_id,candidates').eq('status', 'needs_selection').limit(500));
  for (const row of resolved) if (row.candidates.length === 1) await completeBrandRequest(row.company_id, row.id, row.candidates[0].pageId, { client });
  return pending.length + stale.length;
}
export async function processBrandRequest(id, { client = serviceClient(), resolveIdentity, complete = completeBrandRequest, proxies, proxyCooldowns } = {}) {
  const token = randomUUID();
  const row = value(await client.rpc('ad_library_claim_brand_request', { p_id: id, p_token: token }));
  if (!row) return { skipped: true };
  try {
    const input = parseBrandInput(row.input_url);
    let candidates;
    if (input.pageId) {
      const known = value(await client.from('ad_library_brands').select('name,meta_page_id').eq('source', process.env.ADLIB_COLLECTOR || 'meta_web')
        .eq('meta_page_id', input.pageId).eq('country', 'ALL').limit(1))[0];
      if (known?.name && !known.name.startsWith('Página ')) candidates = [{ pageId: known.meta_page_id, name: known.name,
        fanpageUrl: `https://www.facebook.com/profile.php?id=${known.meta_page_id}` }];
    }
    if (!candidates) ({ candidates } = await resolveIdentity(row.input_url, { proxies, proxyCooldowns }));
    if (!candidates?.length) throw Error('BRAND_IDENTITY_NOT_FOUND');
    const saved = value(await client.from(TABLE).update({ status: 'needs_selection', candidates, last_error: null,
      lease_token: null, lease_until: null, updated_at: new Date().toISOString() }).eq('id', id).eq('lease_token', token).eq('status', 'resolving').select('id'));
    if (saved.length && candidates.length === 1) await complete(row.company_id, id, candidates[0].pageId, { client });
    return { resolved: !!saved.length };
  } catch (error) {
    const code = /^[A-Z0-9_]{1,80}$/.test(error?.message || '') ? error.message : 'BRAND_RESOLUTION_FAILED';
    const rateLimited = code === 'META_RATE_LIMITED';
    const delay = rateLimited ? Math.max(60_000, Math.min(Number(error.retryAfterMs) || 900_000, 86400_000))
      : code === 'BRAND_WEBSITE_NO_FANPAGE' ? 86400_000 : Math.min(21600_000, 900_000 * 2 ** Math.min(row.attempts - 1, 5));
    value(await client.from(TABLE).update({ status: 'pending', next_attempt_at: new Date(Date.now() + delay).toISOString(), last_error: code,
      lease_token: null, lease_until: null, updated_at: new Date().toISOString() }).eq('id', id).eq('lease_token', token).eq('status', 'resolving'));
    if (rateLimited) throw error; // The outer worker retains the source-wide cooldown.
    return { deferred: true };
  }
}
