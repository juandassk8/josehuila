// Offline acceptance test: run in a disposable container with --network none.
// Synthetic responses only; no production database, Redis, storage or proxy credentials.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { MetaWebCollector, ProxyCooldowns } from '../api/_lib/adLibrary/metaWeb.js';

const brand = { meta_page_id: '123456789', country: 'ALL' };
const makeAd = id => ({ ad_archive_id: id, page_id: brand.meta_page_id, is_active: true,
  start_date: 1700000000, snapshot: { page_name: 'Offline fixture', body: { text: `Ad ${id}` }, images: [], videos: [], cards: [] } });
const document = (ids, hasNext) => '<!doctype html><html><body><script type="application/json">' + JSON.stringify({
  data: { ad_library_main: { search_results_connection: {
    edges: ids.map(id => ({ node: { collated_results: [makeAd(id)] } })),
    page_info: { has_next_page: hasNext, end_cursor: hasNext ? 'fixture-next' : null },
  } } },
}) + '</script></body></html>';

async function scenario(allLimited) {
  const browsers = [], requests = [], cleanContexts = [];
  let primaryWasDirty = false;
  const browserType = { launch: async options => {
    if (browsers.length) assert.equal(browsers.at(-1).isConnected(), false, 'Previous browser must be closed');
    const primary = browsers.length === 0;
    const browser = await chromium.launch(options);
    browsers.push(browser);
    const newContext = browser.newContext.bind(browser);
    browser.newContext = async options => {
      assert.deepEqual(options.storageState, { cookies: [], origins: [] });
      const context = await newContext(options);
      const newPage = context.newPage.bind(context);
      context.newPage = async () => {
        const page = await newPage();
        const route = page.route.bind(page);
        page.route = async (pattern, handler) => {
          await route(pattern, handler);
          // Registered last so every request is fulfilled without a network connection.
          await route('**/*', async request => {
            const path = new URL(request.request().url()).pathname;
            requests.push({ primary, path });
            if (path === '/api/graphql/') return request.fulfill({ status: 429, contentType: 'application/json', body: '{}' });
            if (allLimited) return request.fulfill({ status: 429, contentType: 'text/html', body: '<html><body>Limited fixture</body></html>' });
            return request.fulfill({ status: 200, contentType: 'text/html', body: document(primary ? ['10001'] : ['10001', '10002'], primary) });
          });
        };
        const goto = page.goto.bind(page);
        page.goto = async (...args) => {
          const response = await goto(...args);
          const state = await page.evaluate(() => ({ cookie: document.cookie, storage: localStorage.getItem('previous-route') }));
          assert.deepEqual(state, { cookie: '', storage: null });
          cleanContexts.push(primary ? 'primary' : 'backup');
          if (primary) {
            await page.evaluate(() => { document.cookie = 'previous_route=1; path=/; Secure'; localStorage.setItem('previous-route', 'dirty'); });
            primaryWasDirty = (await context.cookies()).some(cookie => cookie.name === 'previous_route');
          }
          return response;
        };
        const evaluate = page.evaluate.bind(page);
        let limited = false;
        page.evaluate = async (fn, arg) => {
          const result = await evaluate(fn, arg);
          if (primary && !allLimited && !limited && String(fn).includes('window.scrollTo')) {
            limited = true;
            await evaluate(() => fetch('https://www.facebook.com/api/graphql/', { method: 'POST' }));
          }
          return result;
        };
        return page;
      };
      return context;
    };
    return browser;
  } };
  const collector = new MetaWebCollector({ browserType, proxyCooldowns: new ProxyCooldowns(), cooldownMs: 60_000,
    maxDurationMs: 10_000, idleTimeoutMs: 5_000,
    proxies: [{ server: 'http://127.0.0.1:19001' }, { server: 'http://127.0.0.1:19002' }] });
  const received = [];
  let failure;
  try { for await (const page of collector.pages(brand)) received.push(...page.ads.map(ad => ad.source_ad_id)); }
  catch (error) { failure = error; }
  assert.equal(browsers.length, 2);
  assert.ok(browsers.every(browser => !browser.isConnected()));
  assert.deepEqual(cleanContexts, ['primary', 'backup']);
  assert.ok(primaryWasDirty, 'The first context must actually contain the test cookie');
  if (allLimited) {
    assert.equal(failure?.message, 'META_RATE_LIMITED');
    assert.ok(failure.retryAfterMs > 0 && failure.retryAfterMs <= 60_000);
    assert.deepEqual(received, []);
  } else {
    assert.equal(failure, undefined);
    assert.deepEqual(received, ['10001', '10002']);
    assert.ok(requests.some(request => request.path === '/api/graphql/'));
  }
  console.log(JSON.stringify({ scenario: allLimited ? 'both-limited' : 'partial-primary-and-backup', cleanContexts: cleanContexts.length,
    browsersClosed: browsers.length, uniqueAds: received.length, success: true }));
}

await scenario(false);
await scenario(true);
