import { createHash } from 'node:crypto';
import { MetaWebCollector, parseWebResponse } from './metaWeb.js';
import { completedCollection } from './collectorContract.js';
import { startSocksBridge } from './socksBridge.js';
import { metaRateLimitError } from './retryPolicy.js';

const MAX_FRAME = 24_000_000;

export async function* jsonLines(body) {
  if (!body) throw new Error('SCRAPLING_PROTOCOL_INVALID');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let pending = '';
  for await (const chunk of body) {
    pending += decoder.decode(chunk, { stream: true });
    let end;
    while ((end = pending.indexOf('\n')) >= 0) {
      if (end > MAX_FRAME) throw new Error('SCRAPLING_PAYLOAD_LIMIT');
      const line = pending.slice(0, end);
      pending = pending.slice(end + 1);
      if (line.trim()) {
        try { yield JSON.parse(line); } catch (error) {
          if (error instanceof SyntaxError) throw new Error('SCRAPLING_PROTOCOL_INVALID');
          throw error;
        }
      }
    }
    if (pending.length > MAX_FRAME) throw new Error('SCRAPLING_PAYLOAD_LIMIT');
  }
  pending += decoder.decode();
  // A missing final newline is a truncated transport, even if it looks like JSON.
  if (pending.trim()) throw new Error('SCRAPLING_PROTOCOL_INVALID');
}

function serviceUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error('SCRAPLING_CONFIG_INVALID'); }
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.search || url.hash
    || !['/', '/crawl'].includes(url.pathname)) throw new Error('SCRAPLING_CONFIG_INVALID');
  url.pathname = '/crawl';
  return url;
}

// Reuses the source's routes, cooldowns and normalizer. The sidecar only captures.
export class ScraplingCollector extends MetaWebCollector {
  constructor({ endpoint = process.env.ADLIB_SCRAPLING_URL, token = process.env.ADLIB_SCRAPLING_TOKEN, fetchImpl = fetch, ...options } = {}) {
    super(options);
    this.endpoint = serviceUrl(endpoint);
    if (typeof token !== 'string' || token.length < 32 || /[\r\n]/.test(token)) throw new Error('SCRAPLING_CONFIG_INVALID');
    this.token = token;
    this.fetchImpl = fetchImpl;
  }

  async *pagesVia(brand, proxy) {
    if (!/^\d{5,25}$/.test(brand.meta_page_id) || !/^(ALL|[A-Z]{2})$/.test(brand.country || 'ALL')) throw new Error('META_INVALID_BRAND');
    const socksUrl = proxy?.username && proxy.server.startsWith('socks5:') ? new URL(proxy.server) : null;
    const bridge = socksUrl ? await startSocksBridge({ host: socksUrl.hostname, port: Number(socksUrl.port), username: proxy.username, password: proxy.password },
      { allowedHosts: /(^|\.)(facebook\.com|fbcdn\.net|fbsbx\.com)$/ }) : null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.maxDurationMs + 15_000);
    let pageCount = 0, ended = false, hasNext = true;
    const seen = new Set();
    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: 'POST', headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        redirect: 'error', signal: controller.signal,
        body: JSON.stringify({ pageId: brand.meta_page_id, country: brand.country || 'ALL',
          activeStatus: brand.last_complete_scan_at ? 'active' : 'all',
          maxPages: this.maxPages, maxDurationMs: this.maxDurationMs, idleTimeoutMs: this.idleTimeoutMs,
          proxy: bridge ? { server: bridge.server } : proxy }),
      });
      if (!response.ok) throw new Error(response.status === 409 ? 'SCRAPLING_BUSY' : 'SCRAPLING_SERVICE_UNAVAILABLE');
      if (!response.headers.get('content-type')?.startsWith('application/x-ndjson')) throw new Error('SCRAPLING_PROTOCOL_INVALID');
      for await (const frame of jsonLines(response.body)) {
        if (ended) throw new Error('SCRAPLING_PROTOCOL_INVALID');
        if (frame.type === 'error') {
          if (frame.code === 'META_RATE_LIMITED') throw metaRateLimitError(frame.retryAfterMs || this.cooldownMs);
          const allowed = new Set(['META_RATE_LIMITED', 'META_ACCESS_REQUIRED', 'META_PROXY_UNAVAILABLE', 'META_CRAWL_TIMEOUT',
            'META_PAGINATION_STALLED', 'META_NO_SEARCH_DATA', 'META_PAGE_LIMIT', 'META_PAYLOAD_LIMIT', 'META_SCHEMA_CHANGED', 'META_SOURCE_ERROR']);
          throw new Error(allowed.has(frame.code) ? frame.code : 'SCRAPLING_CAPTURE_FAILED');
        }
        if (frame.type === 'done') { ended = true; continue; }
        if (frame.type !== 'capture' || typeof frame.body !== 'string') throw new Error('SCRAPLING_PROTOCOL_INVALID');
        for (const batch of parseWebResponse(frame.body, brand.meta_page_id)) {
          const identity = createHash('sha256').update(JSON.stringify([batch.cursor, batch.hasNext, batch.ads.map(ad => ad.source_ad_id)])).digest('hex');
          if (seen.has(identity)) continue;
          seen.add(identity);
          if (++pageCount > this.maxPages) throw new Error('META_PAGE_LIMIT');
          hasNext = batch.hasNext;
          yield { ads: batch.ads, page: pageCount };
        }
      }
      if (!ended || !pageCount || hasNext) throw new Error('COLLECTION_INCOMPLETE');
      yield completedCollection(brand, 'scrapling');
    } finally {
      clearTimeout(timer);
      controller.abort();
      await bridge?.close();
    }
  }
}
