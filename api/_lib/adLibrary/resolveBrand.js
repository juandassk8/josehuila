import { chromium } from 'playwright';
import { safeExternalFetch, readResponseText } from '../safeUrl.js';
import { parseBrandInput, websiteFanpages, jsonScripts, identityCandidates } from './brandIdentity.js';
import { startSocksBridge } from './socksBridge.js';
import { ProxyCooldowns } from './proxyCooldowns.js';
import { metaRateLimitError, sourceCooldownMs } from './retryPolicy.js';

const META_HOST = /(^|\.)(facebook\.com|fbcdn\.net|fbsbx\.com)$/;
export async function readPageIdentity(input, proxy, { browserType = chromium } = {}) {
  let bridge, browser;
  try {
    if (proxy?.username && proxy.server.startsWith('socks5:')) {
      const url = new URL(proxy.server);
      bridge = await startSocksBridge({ host: url.hostname, port: Number(url.port), username: proxy.username, password: proxy.password }, { allowedHosts: META_HOST });
    }
    browser = await browserType.launch({ ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
      ...(proxy ? { proxy: bridge ? { server: bridge.server } : proxy } : {}) });
    const context = await browser.newContext({ locale: 'en-US', storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    let sourceError;
    page.on('response', response => {
      if (!new URL(response.url()).pathname.startsWith('/api/graphql')) return;
      (async () => {
        if (response.status() === 429) { sourceError = metaRateLimitError(sourceCooldownMs()); return; }
        const body = await response.text();
        if (body.length > 15_000_000) { sourceError = Error('META_PAYLOAD_LIMIT'); return; }
        for (const line of body.replace(/^for\s*\(;;\);\s*/, '').split('\n')) {
          let payload; try { payload = JSON.parse(line); } catch { continue; }
          const errors = Array.isArray(payload?.errors) ? payload.errors : [];
          if ([payload?.error, ...errors.map(error => error?.code)].some(code => Number(code) === 1675004)) sourceError = metaRateLimitError(sourceCooldownMs());
        }
      })().catch(() => { /* Closing the context can cancel an unrelated response body. */ });
    });
    await page.route('**/*', route => {
      const r = route.request(), url = new URL(r.url());
      return url.protocol === 'https:' && META_HOST.test(url.hostname) && !['image', 'media', 'font'].includes(r.resourceType()) ? route.continue() : route.abort();
    });
    const response = await page.goto(input.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    if (response?.status() === 429) throw metaRateLimitError(sourceCooldownMs());
    for (let attempt = 0; attempt < 6; attempt++) {
      if (sourceError) throw sourceError;
      if (/\/(login|checkpoint|challenge)(\/|\.php|$)/.test(new URL(page.url()).pathname)) throw Error('META_ACCESS_REQUIRED');
      const html = await page.content();
      if (html.length > 15_000_000) throw Error('META_PAYLOAD_LIMIT');
      const candidates = identityCandidates(jsonScripts(html), input);
      if (candidates.length) return candidates;
      await page.waitForTimeout(1000);
    }
    throw Error('BRAND_IDENTITY_NOT_FOUND');
  } catch (error) {
    if (/net::ERR_(PROXY_|SOCKS_|TUNNEL_|NO_SUPPORTED_PROXIES)/.test(error.message || '')) throw Error('META_PROXY_UNAVAILABLE');
    if (/^[A-Z0-9_]{1,80}$/.test(error.message || '')) throw error;
    throw Error('BRAND_IDENTITY_NOT_FOUND');
  } finally { try { await browser?.close(); } finally { await bridge?.close(); } }
}

export async function resolveBrand(raw, { proxies = [], proxyCooldowns = new ProxyCooldowns(), readIdentity = readPageIdentity, fetchWebsite = safeExternalFetch } = {}) {
  const input = parseBrandInput(raw);
  let inputs = [input];
  if (input.kind === 'website') {
    const response = await fetchWebsite(input.url, { signal: AbortSignal.timeout(20_000), headers: { Accept: 'text/html' } });
    if (!response.ok || !/text\/html/i.test(response.headers.get('content-type') || '')) {
      await response.body?.cancel().catch(() => {}); throw Error('BRAND_WEBSITE_UNAVAILABLE');
    }
    inputs = websiteFanpages(await readResponseText(response, 1_000_000), input.url);
    if (!inputs.length) throw Error('BRAND_WEBSITE_NO_FANPAGE');
  }
  const candidates = new Map();
  let finalError;
  const routes = proxies.length ? proxies : [undefined];
  for (const target of inputs) {
    let lastError;
    for (const proxy of routes) {
      if (await proxyCooldowns.remaining(proxy)) continue;
      try {
        for (const candidate of await readIdentity(target, proxy)) candidates.set(candidate.pageId, candidate);
        lastError = null; break;
      } catch (error) {
        lastError = error; finalError = error;
        if (error.message === 'META_RATE_LIMITED') await proxyCooldowns.block(proxy, error.retryAfterMs || sourceCooldownMs());
        else if (error.message !== 'META_PROXY_UNAVAILABLE') break;
      }
    }
    if (!candidates.size) {
      const pauses = (await Promise.all(routes.map(p => proxyCooldowns.remaining(p)))).filter(n => n > 0);
      if (pauses.length && (!lastError || lastError.message === 'META_RATE_LIMITED')) throw metaRateLimitError(Math.min(...pauses));
    }
  }
  if (!candidates.size) throw finalError || Error('BRAND_IDENTITY_NOT_FOUND');
  return { candidates: [...candidates.values()], resolvedAt: new Date().toISOString() };
}
