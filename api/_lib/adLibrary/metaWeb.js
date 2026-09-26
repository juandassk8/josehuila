import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { startSocksBridge } from './socksBridge.js';
import { metaRateLimitError, sourceCooldownMs } from './retryPolicy.js';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const text = value => typeof value === 'string' && value.trim() ? value.trim() : null;
const date = value => Number.isFinite(Number(value)) && Number(value) > 0 ? new Date(Number(value) * 1000).toISOString() : null;

export function mediaSource(raw, kind) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !/(^|\.)(fbcdn\.net|fbsbx\.com)$/.test(url.hostname)) return null;
    return { url: url.href, kind, sourceKey: hash([kind, url.origin, url.pathname]) };
  } catch { return null; }
}

export function normalizeMetaWebAd(raw, pageId) {
  const snapshot = raw?.snapshot;
  if (!snapshot || !/^\d+$/.test(String(raw.ad_archive_id || '')) || String(raw.page_id || snapshot.page_id) !== String(pageId)) return null;
  if (typeof raw.is_active !== 'boolean') return null;
  const assets = [];
  const add = (url, kind) => { const asset = mediaSource(url, kind); if (asset) assets.push(asset); };
  for (const item of [snapshot, ...(snapshot.cards || [])]) {
    for (const video of item.videos || []) add(video.video_hd_url || video.video_sd_url, 'video');
    for (const image of item.images || []) add(image.original_image_url || image.resized_image_url, 'image');
    add(item.video_hd_url || item.video_sd_url, 'video');
    add(item.original_image_url || item.resized_image_url, 'image');
  }
  const media = [...new Map(assets.map(asset => [asset.sourceKey, asset])).values()].slice(0, 20);
  let landing = null;
  try {
    const url = new URL(snapshot.link_url);
    if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) {
      if (url.hostname === 'l.facebook.com' && url.pathname === '/l.php') {
        const target = new URL(url.searchParams.get('u'));
        if (['http:', 'https:'].includes(target.protocol) && !target.username && !target.password) landing = target.href;
      } else landing = url.href;
    }
  } catch { /* Not every ad publishes a destination. */ }
  const version = {
    body: text(snapshot.body?.text), title: text(snapshot.title), caption: text(snapshot.caption),
    cta: text(snapshot.cta_text), landing_url: landing,
    media_type: media.some(item => item.kind === 'video') ? 'video' : media.length ? 'image' : null,
    source_start_at: date(raw.start_date), source_stop_at: raw.is_active ? null : date(raw.end_date),
    status: raw.is_active ? 'active' : 'inactive',
    media_sources: media.map(({ sourceKey, kind }) => ({ sourceKey, kind })),
    cards: (snapshot.cards || []).map(card => ({ body: text(card.body?.text || card.body), title: text(card.title), description: text(card.link_description) })),
  };
  return { ...version, source_ad_id: String(raw.ad_archive_id), page_name: text(raw.page_name || snapshot.page_name),
    source_url: `https://www.facebook.com/ads/library/?id=${raw.ad_archive_id}`,
    content_hash: hash(version), version, media };
}

// Read only search connections actually delivered to the public browser page.
// Unrelated GraphQL responses and page-info blocks cannot complete a crawl.
export function searchConnections(payload, pageId) {
  const output = [];
  const stack = [payload];
  let visited = 0;
  while (stack.length) {
    if (++visited > 300_000) throw new Error('META_PAYLOAD_LIMIT');
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    const connection = node.ad_library_main?.search_results_connection;
    if (connection) {
      if (!Array.isArray(connection.edges) || typeof connection.page_info?.has_next_page !== 'boolean') throw new Error('META_SCHEMA_CHANGED');
      const rawAds = [];
      const pending = [...connection.edges];
      while (pending.length) {
        const item = pending.pop();
        if (!item || typeof item !== 'object') continue;
        if (item.ad_archive_id && item.snapshot) rawAds.push(item);
        else pending.push(...Object.values(item).filter(value => value && typeof value === 'object'));
      }
      const ads = rawAds.map(raw => normalizeMetaWebAd(raw, pageId)).filter(Boolean);
      if (rawAds.length !== ads.length || (connection.edges.length && !ads.length)) throw new Error('META_PAGE_MISMATCH');
      output.push({ ads, hasNext: connection.page_info.has_next_page, cursor: connection.page_info.end_cursor || null });
    }
    stack.push(...Object.values(node).filter(value => value && typeof value === 'object'));
  }
  return output;
}

export function parseWebResponse(body, pageId) {
  if (body.length > 15_000_000) throw new Error('META_PAYLOAD_LIMIT');
  const batches = [];
  for (const line of body.replace(/^for\s*\(;;\);\s*/, '').split('\n')) {
    let payload;
    try { payload = JSON.parse(line); } catch { continue; }
    const errors = Array.isArray(payload?.errors) ? payload.errors : [];
    const codes = [payload?.error, ...errors.map(error => error?.code)];
    if (codes.some(code => Number(code) === 1675004)) throw new Error('META_RATE_LIMITED');
    if (payload?.error || errors.length) throw new Error('META_SOURCE_ERROR');
    batches.push(...searchConnections(payload, pageId));
  }
  return batches;
}

// Proxy de salida estable y opcional. Las credenciales van en variables aparte,
// nunca en la URL, para que no aparezcan en logs. Una configuración inválida
// detiene la corrida en lugar de salir en silencio por la IP del servidor.
export function proxyFromEnv(env = process.env, prefix = 'ADLIB_PROXY') {
  const raw = env[`${prefix}_SERVER`]?.trim();
  if (!raw) return undefined;
  let url;
  try { url = new URL(raw); } catch { throw new Error('ADLIB_PROXY_INVALID'); }
  if (!['http:', 'https:', 'socks5:'].includes(url.protocol) || !url.hostname || !url.port || url.username || url.password
    || url.pathname.replace(/\/$/, '') || url.search || url.hash) throw new Error('ADLIB_PROXY_INVALID');
  const username = env[`${prefix}_USERNAME`]?.trim(), password = env[`${prefix}_PASSWORD`];
  if (!!username !== !!password) throw new Error('ADLIB_PROXY_INVALID');
  return { server: `${url.protocol}//${url.host}`, ...(username ? { username, password } : {}) };
}

// Principal y respaldo configurados explícitamente; nunca se añade una salida directa.
export function proxiesFromEnv(env = process.env) {
  const primary = proxyFromEnv(env), backup = proxyFromEnv(env, 'ADLIB_PROXY_BACKUP');
  if (backup && !primary) throw new Error('ADLIB_PROXY_INVALID');
  return [primary, backup].filter(Boolean);
}

const PROXY_FAILURE = /net::ERR_(PROXY_[A-Z_]+|SOCKS_[A-Z_]+|TUNNEL_CONNECTION_FAILED|NO_SUPPORTED_PROXIES)/;

export class ProxyCooldowns {
  constructor(now = Date.now) { this.now = now; this.until = new Map(); }
  key(proxy) { return hash([proxy?.server || 'direct', proxy?.username || '']); }
  remaining(proxy) {
    const key = this.key(proxy);
    const remaining = Math.max(0, (this.until.get(key) || 0) - this.now());
    if (!remaining) this.until.delete(key);
    return remaining;
  }
  block(proxy, duration) { this.until.set(this.key(proxy), this.now() + duration); }
}

// Shared across brands in this worker, so the next brand uses the healthy route.
const workerProxyCooldowns = new ProxyCooldowns();

export class MetaWebCollector {
  constructor({ browserType = chromium, maxPages = 500, maxDurationMs = 15 * 60_000, idleTimeoutMs = 30_000, proxies = proxiesFromEnv(),
    proxyCooldowns = workerProxyCooldowns, cooldownMs = sourceCooldownMs() } = {}) {
    Object.assign(this, { browserType, maxPages, maxDurationMs, idleTimeoutMs, proxies, proxyCooldowns, cooldownMs });
  }

  async *pages(brand) {
    const routes = this.proxies.length ? this.proxies : [undefined];
    const delivered = new Set();
    let lastError;
    for (let index = 0; index < routes.length; index++) {
      const proxy = routes[index];
      if (this.proxyCooldowns.remaining(proxy)) continue;
      try {
        for await (const page of this.pagesVia(brand, proxy)) {
          const ads = page.ads.filter(ad => {
            const key = hash([ad.source_ad_id, ad.content_hash, ad.status]);
            if (delivered.has(key)) return false;
            delivered.add(key);
            return true;
          });
          yield { ...page, ads };
        }
        return;
      } catch (error) {
        if (!['META_PROXY_UNAVAILABLE', 'META_RATE_LIMITED'].includes(error.message)) throw error;
        lastError = error;
        if (error.message === 'META_RATE_LIMITED') this.proxyCooldowns.block(proxy, this.cooldownMs);
        if (index < routes.length - 1) console.warn('[ad-library] retrying configured route', error.message, index + 2);
      }
    }
    const remaining = routes.map(proxy => this.proxyCooldowns.remaining(proxy)).filter(ms => ms > 0);
    if (remaining.length) throw metaRateLimitError(Math.min(...remaining));
    throw lastError || new Error('META_PROXY_UNAVAILABLE');
  }

  async *pagesVia(brand, proxy) {
    if (!/^\d{5,25}$/.test(brand.meta_page_id) || !/^(ALL|[A-Z]{2})$/.test(brand.country || 'ALL')) throw new Error('META_INVALID_BRAND');
    // Chromium no admite SOCKS5 autenticado: en ese caso sale por un puente local.
    const socksUrl = proxy?.username && proxy.server.startsWith('socks5:') ? new URL(proxy.server) : null;
    // El tráfico de fondo de Chrome (servicios de Google) no gasta el proxy.
    const bridge = socksUrl ? await startSocksBridge({ host: socksUrl.hostname, port: Number(socksUrl.port), username: proxy.username, password: proxy.password },
      { allowedHosts: /(^|\.)(facebook\.com|fbcdn\.net|fbsbx\.com)$/ }) : null;
    let browser;
    try {
      browser = await this.browserType.launch({
        ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
        ...(proxy ? { proxy: bridge ? { server: bridge.server } : proxy } : {}),
      });
    } catch (error) { await bridge?.close(); throw error; }
    let context;
    const pending = new Set();
    const batches = [];
    const seen = new Set();
    let failure = null, pageCount = 0, hasNext = true;
    let progressAt = Date.now();
    const startedAt = progressAt;
    const ingest = body => {
      for (const batch of parseWebResponse(body, brand.meta_page_id)) {
        const identity = hash([batch.cursor, batch.hasNext, batch.ads.map(ad => ad.source_ad_id)]);
        if (seen.has(identity)) continue;
        seen.add(identity);
        batches.push(batch);
        progressAt = Date.now();
      }
    };
    try {
      context = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 1000 }, storageState: { cookies: [], origins: [] } });
      const page = await context.newPage();
      await page.route('**/*', route => {
        const request = route.request();
        const url = new URL(request.url());
        const allowed = url.protocol === 'https:' && /(^|\.)(facebook\.com|fbcdn\.net|fbsbx\.com)$/.test(url.hostname);
        // Assets are archived by the media worker; rendering previews here can
        // exhaust Chrome's memory on long catalogs without helping collection.
        return !allowed || ['image', 'media', 'font'].includes(request.resourceType()) ? route.abort() : route.continue();
      });
      page.on('response', response => {
        if (!new URL(response.url()).pathname.startsWith('/api/graphql')) return;
        const task = (async () => {
          if (response.status() === 429) { failure = new Error('META_RATE_LIMITED'); return; }
          try { ingest(await response.text()); }
          catch (error) { if (error.message?.startsWith('META_')) failure = error; }
        })();
        pending.add(task);
        task.finally(() => pending.delete(task));
      });
      const url = new URL('https://www.facebook.com/ads/library/');
      Object.entries({ active_status: brand.last_complete_scan_at ? 'active' : 'all', ad_type: 'all', country: brand.country || 'ALL', search_type: 'page', view_all_page_id: brand.meta_page_id }).forEach(([key, value]) => url.searchParams.set(key, value));
      const response = await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(error => {
        throw PROXY_FAILURE.test(error.message || '') ? new Error('META_PROXY_UNAVAILABLE', { cause: error }) : error;
      });
      if (response?.status() === 429) throw new Error('META_RATE_LIMITED');
      const readScripts = async () => {
        try { for (const body of await page.locator('script[type="application/json"]').allTextContents()) ingest(body); }
        catch (error) { if (!error.message?.includes('Execution context was destroyed')) throw error; }
      };
      await readScripts();
      while (true) {
        if (failure) throw failure;
        if (/\/(login|checkpoint|challenge)(\/|\.php|$)/.test(new URL(page.url()).pathname)) throw new Error('META_ACCESS_REQUIRED');
        while (batches.length) {
          if (++pageCount > this.maxPages) throw new Error('META_PAGE_LIMIT');
          const batch = batches.shift();
          hasNext = batch.hasNext;
          yield { ads: batch.ads, page: pageCount };
          progressAt = Date.now();
        }
        if (pageCount && !hasNext) {
          await Promise.all(pending);
          if (failure) throw failure;
          if (!batches.length) return;
          continue;
        }
        if (Date.now() - startedAt > this.maxDurationMs) throw new Error('META_CRAWL_TIMEOUT');
        if (Date.now() - progressAt > this.idleTimeoutMs) throw new Error(pageCount ? 'META_PAGINATION_STALLED' : 'META_NO_SEARCH_DATA');
        try { await page.evaluate(() => { if (document.body) window.scrollTo(0, document.body.scrollHeight); }); }
        catch (error) { if (!error.message?.includes('Execution context was destroyed')) throw error; }
        await page.waitForTimeout(1200);
        if (!pageCount) await readScripts();
      }
    } finally {
      await Promise.allSettled([context?.close()]);
      await Promise.allSettled([browser.close(), ...pending]);
      await bridge?.close();
    }
  }
}
