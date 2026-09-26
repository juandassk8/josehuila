import { AuthError, getUser, isTeamManager, isTeamMember, requireCompanyAccess, serviceClient } from './_lib/auth.js';
import { parseMetaPageId } from './_lib/adLibrary/core.js';
import { enqueueBrand, sourceRetryAt, crawlQueueStatus } from './_lib/adLibrary/queue.js';
import { collectionStatus } from './_lib/adLibrary/collectionStatus.js';
import { createMediaStorage } from './_lib/adLibrary/storage.js';
import { readCursor, workspaceParams } from './_lib/adLibrary/workspace.js';

export const config = { api: { bodyParser: { sizeLimit: '16kb' } } };

function fail(status, message) { throw new AuthError(status, message); }
function result(data) { if (data.error) throw new Error(data.error.message || 'Database request failed'); return data.data; }

async function authorize(req, companyId, write = false) {
  if (!companyId || typeof companyId !== 'string' || companyId.length > 128) fail(400, 'Empresa inválida');
  const user = await getUser(req);
  const sb = serviceClient();
  const company = result(await sb.from('companies').select('id').eq('id', companyId).maybeSingle());
  if (!company) fail(404, 'Empresa no encontrada');
  if (await isTeamMember(user.id)) {
    const manager = await isTeamManager(user.id);
    if (write && !manager) fail(403, 'Solo administradores y gestores pueden cambiar seguimientos');
    if (!manager) await requireCompanyAccess(req, companyId);
    return user;
  }
  await requireCompanyAccess(req, companyId);
  if (!write) return user;
  const owner = result(await sb.from('companies').select('id').eq('id', companyId).eq('owner_user_id', user.id).maybeSingle());
  const manager = result(await sb.from('company_team_members').select('id,is_owner,roles').eq('company_id', companyId)
    .eq('auth_user_id', user.id).maybeSingle());
  if (!owner && !manager?.is_owner && !(Array.isArray(manager?.roles) && manager.roles.includes('project_manager')))
    fail(403, 'Solo el responsable o gestor de la empresa puede seguir marcas');
  return user;
}

async function followedBrands(companyId) {
  const sb = serviceClient();
  const follows = result(await sb.from('ad_library_follows').select('brand_id,alias,created_at')
    .eq('company_id', companyId).eq('active', true).order('created_at', { ascending: false }).limit(500));
  if (!follows.length) return [];
  const brands = result(await sb.from('ad_library_brands').select('*').in('id', follows.map(row => row.brand_id)));
  const order = new Map(follows.map((row, index) => [row.brand_id, index]));
  const alias = new Map(follows.map(row => [row.brand_id, row.alias]));
  return brands.map(brand => ({ ...brand, display_name: alias.get(brand.id) || brand.name }))
    .sort((a, b) => order.get(a.id) - order.get(b.id));
}

async function queryParams(companyId, userId, query) {
  const brands = await followedBrands(companyId);
  if (query.brandId && !brands.some(brand => brand.id === query.brandId)) fail(403, 'Marca no seguida por esta empresa');
  return workspaceParams(companyId, userId, query);
}

async function brandCollection(companyId, brandId, knownBrand) {
  const brand = knownBrand || (await followedBrands(companyId)).find(item => item.id === brandId);
  if (!brand) fail(403, 'Marca no seguida por esta empresa');
  const [queue, latest] = await Promise.all([
    crawlQueueStatus(brand.id),
    serviceClient().from('ad_library_crawl_runs').select('id,status,ads_seen,finished_at,error_code').eq('brand_id', brand.id)
      .order('started_at', { ascending: false }).limit(1),
  ]);
  return collectionStatus(brand, queue, result(latest)?.[0]);
}

async function listAds(companyId, userId, query) {
  const sb = serviceClient();
  const params = await queryParams(companyId, userId, query);
  const pageSize = Math.min(Math.max(Math.trunc(Number(query.limit) || 30), 1), 50);
  const sort = query.sort || 'newest';
  const rows = result(await sb.rpc('ad_library_workspace_page', { ...params, p_sort: sort,
    ...readCursor(query.cursor, sort), p_limit: pageSize + 1 }));
  const ads = rows.slice(0, pageSize);
  const tail = ads.at(-1);
  const nextCursor = rows.length > pageSize && tail
    ? Buffer.from(JSON.stringify({ value: Number(tail.sort_value), id: tail.id, sort })).toString('base64url') : null;

  if (ads.length && (process.env.R2_BUCKET || process.env.S3_BUCKET)) {
    const readyIds = ads.filter(ad => ad.media_content_hash === ad.content_hash).map(ad => ad.id);
    const links = readyIds.length ? result(await sb.from('ad_library_ad_media').select('ad_id,sha256,kind,position').in('ad_id', readyIds).order('position')) : [];
    if (links.length) {
      const media = result(await sb.from('ad_library_media').select('sha256,object_key,mime_type,poster_object_key,width,height,duration_seconds')
        .in('sha256', [...new Set(links.map(link => link.sha256))]));
      const byHash = new Map(media.map(item => [item.sha256, item]));
      const storage = createMediaStorage();
      const byAd = new Map();
      await Promise.all(links.map(async link => {
        const item = byHash.get(link.sha256);
        if (!item) return;
        let url;
        try { url = await storage.signedRead(item.object_key); }
        catch { return; }
        if (!byAd.has(link.ad_id)) byAd.set(link.ad_id, []);
        byAd.get(link.ad_id).push({ kind: link.kind, url, position: link.position,
          poster: item.poster_object_key ? await storage.signedRead(item.poster_object_key) : null,
          width: item.width, height: item.height, duration: item.duration_seconds });
      }));
      for (const ad of ads) ad.media = (byAd.get(ad.id) || []).sort((a, b) => a.position - b.position);
      storage.close();
    }
  }
  return { ads, nextCursor };
}

async function authorizedAd(companyId, adId) {
  if (!/^[0-9a-f-]{36}$/i.test(String(adId || ''))) fail(400, 'Anuncio inválido');
  const ad = result(await serviceClient().from('ad_library_ads').select('id,brand_id').eq('id', adId).maybeSingle());
  const brands = await followedBrands(companyId);
  if (!ad || !brands.some(brand => brand.id === ad.brand_id)) fail(404, 'Anuncio no disponible');
  return ad;
}

async function saveAd(companyId, userId, body) {
  await authorizedAd(companyId, body.adId);
  if (typeof body.saved !== 'boolean') fail(400, 'Estado de guardado inválido');
  const sb = serviceClient();
  if (body.saved) result(await sb.from('ad_library_saves').upsert({ company_id: companyId, user_id: userId, ad_id: body.adId }, { onConflict: 'company_id,user_id,ad_id' }));
  else result(await sb.from('ad_library_saves').delete().eq('company_id', companyId).eq('user_id', userId).eq('ad_id', body.adId));
  return { saved: body.saved };
}

async function adHistory(companyId, adId) {
  await authorizedAd(companyId, adId);
  const versions = result(await serviceClient().from('ad_library_versions').select('id,content,captured_at')
    .eq('ad_id', adId).order('captured_at', { ascending: false }).limit(50));
  return { versions: versions.map(({ id, content, captured_at }) => ({ id, captured_at,
    body: content.body, title: content.title, cta: content.cta, status: content.status })) };
}

async function follow(companyId, userId, body) {
  const pageId = parseMetaPageId(body.pageUrl || body.pageId);
  if (!pageId) fail(400, 'Usa el enlace de la biblioteca con view_all_page_id o el ID exacto de página');
  const requestedCountry = String(body.country || 'ALL').trim().toUpperCase();
  if (requestedCountry !== 'ALL' && !/^[A-Z]{2}$/.test(requestedCountry)) fail(400, 'País inválido');
  const alias = String(body.name || '').trim().slice(0, 120) || null;
  const sb = serviceClient();
  const source = process.env.ADLIB_COLLECTOR || 'meta_web';
  if (!['meta_web', 'meta_official'].includes(source)) fail(503, 'Fuente de anuncios no configurada');
  // One public collection per page, reused across every following company.
  const country = source === 'meta_web' ? 'ALL' : requestedCountry;
  result(await sb.from('ad_library_brands').upsert({
    source, meta_page_id: pageId, country, name: `Página ${pageId}`,
  }, { onConflict: 'source,meta_page_id,country', ignoreDuplicates: true }));
  const brand = result(await sb.from('ad_library_brands').select('*').eq('source', source)
    .eq('meta_page_id', pageId).eq('country', country).single());
  result(await sb.from('ad_library_follows').upsert({ company_id: companyId, brand_id: brand.id,
    active: true, alias, created_by: userId }, { onConflict: 'company_id,brand_id' }));
  if (brand.last_complete_scan_at && Date.parse(brand.next_crawl_at) > Date.now())
    return { brand, queued: false, cached: true, collection: await brandCollection(companyId, brand.id, brand) };
  let queued = true;
  try { await enqueueBrand(brand.id); } catch (error) { queued = false; console.error('[ad-library] queue unavailable', error.name); }
  return { brand, queued, collection: await brandCollection(companyId, brand.id, brand) };
}

async function pause(companyId, brandId) {
  if (!/^[0-9a-f-]{36}$/i.test(String(brandId || ''))) fail(400, 'Marca inválida');
  const sb = serviceClient();
  result(await sb.from('ad_library_follows').update({ active: false }).eq('company_id', companyId).eq('brand_id', brandId));
  return { ok: true };
}

async function sync(companyId, brandId) {
  const brands = await followedBrands(companyId);
  const brand = brands.find(item => item.id === brandId);
  if (!brand) fail(403, 'Marca no seguida por esta empresa');
  if (brand.last_crawl_at && Date.now() - Date.parse(brand.last_crawl_at) < 10 * 60_000) fail(429, 'Espera diez minutos antes de sincronizar otra vez');
  await enqueueBrand(brand.id);
  return { queued: true, collection: await brandCollection(companyId, brand.id, brand) };
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
    const body = req.method === 'POST' ? req.body || {} : req.query || {};
    const action = body.action || (req.method === 'GET' ? 'brands' : '');
    const companyId = body.companyId;
    const write = req.method === 'POST' && action !== 'save';
    const user = await authorize(req, companyId, write);
    if (req.method === 'GET' && action === 'brands') return res.json({ brands: await followedBrands(companyId), sourceRetryAt: await sourceRetryAt() });
    if (req.method === 'GET' && action === 'collection') return res.json(await brandCollection(companyId, body.brandId));
    if (req.method === 'GET' && action === 'ads') return res.json(await listAds(companyId, user.id, body));
    if (req.method === 'GET' && action === 'insights') return res.json(result(await serviceClient().rpc('ad_library_workspace_insights', await queryParams(companyId, user.id, body))));
    if (req.method === 'GET' && action === 'history') return res.json(await adHistory(companyId, body.adId));
    if (req.method === 'POST' && action === 'save') return res.json(await saveAd(companyId, user.id, body));
    if (req.method === 'POST' && action === 'follow') return res.json(await follow(companyId, user.id, body));
    if (req.method === 'POST' && action === 'pause') return res.json(await pause(companyId, body.brandId));
    if (req.method === 'POST' && action === 'sync') return res.json(await sync(companyId, body.brandId));
    return res.status(400).json({ error: 'Acción inválida' });
  } catch (error) {
    if (error instanceof AuthError) return res.status(error.status).json({ error: error.message });
    console.error('[ad-library]', error.name);
    return res.status(500).json({ error: 'No se pudo consultar la biblioteca de anuncios' });
  }
}
