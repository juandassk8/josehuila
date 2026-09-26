import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

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

export class MetaWebCollector {
  constructor({ browserType = chromium, maxPages = 500, maxDurationMs = 15 * 60_000, idleTimeoutMs = 30_000 } = {}) {
    Object.assign(this, { browserType, maxPages, maxDurationMs, idleTimeoutMs });
  }

  async *pages(brand) {
    if (!/^\d{5,25}$/.test(brand.meta_page_id) || !/^(ALL|[A-Z]{2})$/.test(brand.country || 'ALL')) throw new Error('META_INVALID_BRAND');
    const browser = await this.browserType.launch(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {});
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
      const page = await browser.newPage({ locale: 'en-US', viewport: { width: 1280, height: 1000 } });
      await page.route('**/*', route => {
        const request = route.request();
        const url = new URL(request.url());
        const allowed = url.protocol === 'https:' && /(^|\.)(facebook\.com|fbcdn\.net|fbsbx\.com)$/.test(url.hostname);
        return !allowed || ['media', 'font'].includes(request.resourceType()) ? route.abort() : route.continue();
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
      const response = await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 45_000 });
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
      await browser.close();
      await Promise.allSettled(pending);
    }
  }
}
