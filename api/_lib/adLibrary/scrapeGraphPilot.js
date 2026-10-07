import { parseWebResponse } from './metaWeb.js';
import { retryAfterMs } from './retryPolicy.js';
import { inspectVisibleEvidence, canonicalPageUrl } from './scrapeGraphEvidence.js';

const API = 'https://v2-api.scrapegraphai.com/api/';
const MAX_RESPONSE = 20_000_000;
// 2026-10-06: one format, no stealth. Recheck pricing before a paid pilot.
export const SCRAPEGRAPH_PILOT_CREDITS = 1;

export function pilotRequest(pageId, { country = 'ALL', scrolls = 0, format = 'markdown', activeStatus = 'active', pageUrl } = {}) {
  if (!/^\d{5,25}$/.test(pageId) || !/^(ALL|[A-Z]{2})$/.test(country)
    || !Number.isInteger(scrolls) || scrolls < 0 || scrolls > 100
    || !['markdown', 'html'].includes(format) || !['active', 'all', 'inactive'].includes(activeStatus)) throw new Error('SGAI_PILOT_CONFIG_INVALID');
  if (format === 'markdown' && !canonicalPageUrl(pageUrl)) throw new Error('SGAI_PAGE_IDENTITY_REQUIRED');
  const url = new URL('https://web.facebook.com/ads/library/');
  Object.entries({ active_status: activeStatus, ad_type: 'all', country, is_targeted_country: 'false', media_type: 'all',
    search_type: 'page', 'sort_data[mode]': 'total_impressions', 'sort_data[direction]': 'desc',
    source: 'page-transparency-widget', view_all_page_id: pageId })
    .forEach(([key, value]) => url.searchParams.set(key, value));
  return { url: url.href, formats: [{ type: format, mode: 'normal' }], allowedTypes: ['text/html'],
    fetchConfig: { mode: 'auto', stealth: false, scrolls, wait: 0, timeout: 60000 } };
}

async function readJson(response) {
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('SGAI_RESPONSE_INVALID');
  const chunks = []; let size = 0;
  if (!response.body) throw new Error('SGAI_RESPONSE_INVALID');
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > MAX_RESPONSE) throw new Error('SGAI_RESPONSE_TOO_LARGE');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error('SGAI_RESPONSE_INVALID'); }
}

// Prefer source JSON; supported visible cards require a confirmed fanpage URL.
// Neither an HTML snapshot nor Markdown certifies a complete inventory.
export function inspectPilotResponse(payload, pageId, { pageUrl } = {}) {
  const html = payload?.results?.html?.data;
  const markdown = payload?.results?.markdown?.data;
  const strings = value => value === undefined ? [] : typeof value === 'string' ? [value] : value;
  const documents = strings(html), visible = strings(markdown);
  if (![documents, visible].every(items => Array.isArray(items) && items.every(item => typeof item === 'string'))
    || (!documents.length && !visible.length)) throw new Error('SGAI_RESPONSE_INVALID');
  const ads = new Map(); let batches = 0;
  for (const document of documents) {
    for (const match of document.matchAll(/<script\b[^>]*\btype\s*=\s*["']application\/json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)) {
      for (const batch of parseWebResponse(match[1], pageId)) {
        batches++;
        for (const ad of batch.ads) ads.set(ad.source_ad_id, ad);
      }
    }
  }
  let visibleEvidence = { rejectedCards: 0, reportedTotal: null, missingVideo: 0 };
  if (!ads.size && visible.length) {
    const { ads: cards, ...evidence } = inspectVisibleEvidence(visible, pageId, { pageUrl });
    visibleEvidence = evidence;
    for (const ad of cards) ads.set(ad.source_ad_id, ad);
  }
  return { provider: 'scrapegraph', requestId: typeof payload.id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(payload.id) ? payload.id : null,
    // A rendered HTML snapshot cannot prove that every GraphQL page was captured.
    complete: false, coverage: ads.size ? 'partial' : 'unverified', evidenceBatches: batches,
    evidenceKind: batches ? 'meta_search_json' : ads.size ? 'visible_meta_cards' : 'none', ...visibleEvidence,
    ads: [...ads.values()], withMedia: [...ads.values()].filter(ad => ad.media?.length).length };
}

export class ScrapeGraphPilot {
  constructor({ apiKey = process.env.SGAI_API_KEY, fetchImpl = fetch } = {}) {
    if (typeof apiKey !== 'string' || !apiKey.trim() || /[\r\n]/.test(apiKey)) throw new Error('SGAI_KEY_MISSING');
    this.apiKey = apiKey; this.fetchImpl = fetchImpl;
  }

  async request(path, body) {
    let response;
    try {
      response = await this.fetchImpl(API + path, { method: body ? 'POST' : 'GET', redirect: 'error',
        headers: { 'SGAI-APIKEY': this.apiKey, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(body ? 90_000 : 15_000) });
    } catch { throw new Error('SGAI_TRANSPORT_FAILED'); }
    if (!response.ok) {
      await response.body?.cancel();
      const code = { 400: 'SGAI_REQUEST_INVALID', 401: 'SGAI_AUTH_FAILED', 403: 'SGAI_AUTH_FAILED',
        402: 'SGAI_CREDITS_EXHAUSTED', 429: 'SGAI_RATE_LIMITED' }[response.status] || 'SGAI_SERVICE_FAILED';
      const error = new Error(code);
      error.httpStatus = response.status;
      if (response.status === 429) error.retryAfterMs = retryAfterMs(response.headers.get('retry-after'));
      throw error;
    }
    const payload = await readJson(response);
    if (payload?.error) throw new Error('SGAI_SERVICE_FAILED');
    return payload;
  }

  async credits() {
    const value = await this.request('credits');
    if (!Number.isFinite(value?.remaining) || value.remaining < 0) throw new Error('SGAI_RESPONSE_INVALID');
    return { remaining: value.remaining, used: Number.isFinite(value.used) && value.used >= 0 ? value.used : null };
  }

  async run(pageId, { budget, attemptId, country, scrolls, format, activeStatus, pageUrl, saveEvidence = async () => {} } = {}) {
    const request = pilotRequest(pageId, { country, scrolls, format, activeStatus, pageUrl });
    if (!budget || !attemptId) throw new Error('SGAI_BUDGET_REQUIRED');
    const before = await this.credits();
    if (before.remaining < SCRAPEGRAPH_PILOT_CREDITS) throw new Error('SGAI_CREDITS_EXHAUSTED');
    // Persist BEFORE the billable call. Timeout/crash does not release credits or retry.
    await budget.reserve(attemptId, SCRAPEGRAPH_PILOT_CREDITS, { pageId, request });
    try {
      const payload = await this.request('scrape', request);
      // Preserve original evidence before parsing, so a parser fix never requires paying again.
      await saveEvidence({ pageId, pageUrl, observedAt: new Date().toISOString(), request, payload });
      const result = inspectPilotResponse(payload, pageId, { pageUrl });
      let after = null;
      try { after = await this.credits(); } catch { /* The request is still charged/reserved. */ }
      const observedBalanceDelta = after ? before.remaining - after.remaining : null;
      await budget.record(attemptId, { status: 'received', requestId: result.requestId, observedBalanceDelta });
      return { ...result, creditsReserved: SCRAPEGRAPH_PILOT_CREDITS, before, after, observedBalanceDelta };
    } catch (error) {
      await budget.record(attemptId, { status: 'failed_or_uncertain', errorCode: /^SGAI_|^META_/.test(error.message) ? error.message : 'SGAI_PILOT_FAILED' });
      throw error;
    }
  }
}
