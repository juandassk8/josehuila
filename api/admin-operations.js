import { AuthError, requireTeamAdmin, serviceClient } from './_lib/auth.js';
import { readSettings, validateSettings } from './_lib/adminOperations/settings.js';
import { bounded, readRuntime } from './_lib/adminOperations/runtime.js';
import { commandsRedis, enqueueBrand } from './_lib/adLibrary/queue.js';
import { prepareProxyTest, readProxySettings, saveProxySettings } from './_lib/adminOperations/proxies.js';
import { probeProxy } from './_lib/adminOperations/proxyProbe.js';
import { listBrandRequests } from './_lib/adLibrary/brandRequests.js';
import { readScrapeGraphSettings, saveScrapeGraphSettings, checkScrapeGraphSettings } from './_lib/adminOperations/scrapeGraph.js';

export const config = { api: { bodyParser: { sizeLimit: '32kb' } } };
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
function value(result) {
  if (result.error) {
    if (result.error.code === '40001') throw new AuthError(409, 'Otro administrador cambió la configuración. Recarga los ajustes antes de guardar.');
    throw new Error('ADMIN_DATABASE_UNAVAILABLE');
  }
  return result.data;
}
function offset(input) {
  const n = Number(input || 0);
  if (!Number.isInteger(n) || n < 0 || n > 100000) throw new AuthError(400, 'Página inválida');
  return n;
}

export default async function handler(req, res) {
  res.setHeader?.('Cache-Control', 'no-store');
  try {
    // Every action, including status/read endpoints, is restricted on the server.
    const user = await requireTeamAdmin(req);
    const client = serviceClient();
    const input = req.method === 'GET' ? req.query || {} : req.body || {};
    const action = input.action || 'overview';
    if (req.method === 'GET') {
      if (action === 'scrapegraph') return res.json({ scrapegraph: await readScrapeGraphSettings(client) });
      if (action === 'brand-requests') return res.json({ requests: await listBrandRequests(null, { client, admin: true }) });
      if (action === 'proxies') return res.json({ proxies: await readProxySettings(client) });
      if (action === 'overview') {
        const [summary, settings, runtime] = await Promise.all([
          client.rpc('admin_operations_summary').then(value), readSettings(client), readRuntime(),
        ]);
        return res.json({ summary, settings, runtime, capturedAt: new Date().toISOString() });
      }
      if (action === 'brands') {
        if (typeof (input.search || '') !== 'string' || (input.search || '').length > 100) throw new AuthError(400, 'Búsqueda demasiado larga');
        return res.json(value(await client.rpc('admin_operations_brands', {
          p_search: input.search || '', p_attention: input.attention === 'true', p_offset: offset(input.offset),
        })));
      }
      if (action === 'runs') {
        if (!['', 'running', 'complete', 'failed'].includes(input.status || '') || (input.brandId && !uuid(input.brandId))) throw new AuthError(400, 'Filtro inválido');
        return res.json(value(await client.rpc('admin_operations_runs', {
          p_status: input.status || '', p_brand: input.brandId || null, p_offset: offset(input.offset),
        })));
      }
      if (action === 'audit') return res.json({ rows: value(await client.from('admin_operations_audit')
        .select('id,actor_name,action,brand_id,before_value,after_value,created_at').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(50)) });
    } else if (req.method === 'POST') {
      if (action === 'save-scrapegraph') return res.json({ scrapegraph: await saveScrapeGraphSettings(input, user.id, { client }) });
      if (action === 'check-scrapegraph') {
        const reserved = await commandsRedis().set('adlib:admin:scrapegraph-check', '1', 'EX', 30, 'NX');
        if (!reserved) throw new AuthError(429, 'Espera 30 segundos antes de volver a comprobar el saldo.');
        return res.json({ scrapegraph: await checkScrapeGraphSettings(input, user.id, { client }) });
      }
      if (action === 'save-proxies') return res.json({ proxies: await saveProxySettings(input, user.id, { client }) });
      if (action === 'test-proxy') {
        const redis = commandsRedis();
        const reserved = await redis.set(`adlib:admin:proxy-test:${user.id}`, '1', 'EX', 15, 'NX');
        if (!reserved) throw new AuthError(429, 'Espera 15 segundos antes de volver a probar una conexión.');
        const proxy = await prepareProxyTest(input, { client });
        return res.json({ result: await probeProxy(proxy) });
      }
      if (action === 'save-settings') {
        let settings;
        try { settings = validateSettings(input.settings); }
        catch { throw new AuthError(400, 'Revisa los intervalos: entre 1 y 168 horas; errores hasta 24 h. Sin cambios debe ser igual o mayor que con cambios.'); }
        if (!Number.isInteger(input.revision) || input.revision < 1) throw new AuthError(400, 'Revisión inválida');
        return res.json({ settings: value(await client.rpc('admin_save_collection_settings', {
          p_actor: user.id, p_revision: input.revision, p_settings: settings,
        })) });
      }
      if (action === 'refresh-brand') {
        if (!uuid(input.brandId)) throw new AuthError(400, 'Marca inválida');
        const settings = await readSettings(client);
        if (!settings.enabled) throw new AuthError(409, 'La recolección está pausada. Actívala en Configuración.');
        const follows = value(await client.from('ad_library_follows').select('id').eq('brand_id', input.brandId).eq('active', true).limit(1));
        if (!follows.length) throw new AuthError(409, 'Esta marca no tiene empresas siguiéndola.');
        const actor = value(await client.from('team_members').select('name').eq('id', user.id).single());
        const audit = value(await client.from('admin_operations_audit').insert({ actor_id: user.id, actor_name: actor.name || 'Administrador',
          action: 'crawl_requested', brand_id: input.brandId, after_value: { status: 'requested' } }).select('id').single());
        try {
          await bounded(enqueueBrand(input.brandId, { reason: 'manual' }), 6000);
        } catch {
          await client.from('admin_operations_audit').update({ after_value: { status: 'unconfirmed' } }).eq('id', audit.id);
          throw new AuthError(503, 'No se pudo confirmar la solicitud. Revisa la cola antes de reintentar.');
        }
        // Audit was durably written before enqueueing. No second enqueue if this update fails.
        const recorded = await client.from('admin_operations_audit').update({ after_value: { status: 'queued' } }).eq('id', audit.id);
        return res.json({ ok: true, auditConfirmed: !recorded.error,
          message: 'Consulta solicitada. Respetará el orden de la cola y las pausas del proveedor.' });
      }
    } else return res.status(405).json({ error: 'Método no permitido' });
    throw new AuthError(400, 'Acción inválida');
  } catch (error) {
    const known = error instanceof AuthError;
    return res.status(known ? error.status : 503).json({ error: known ? error.message
      : 'Administración no disponible. Revisa la conexión y la migración del panel.' });
  }
}
