import { describe, expect, it, vi } from 'vitest';
import { MetaWebCollector, ProxyCooldowns, mediaSource, normalizeMetaWebAd, parseWebResponse, proxiesFromEnv, proxyFromEnv } from './metaWeb.js';

const raw = () => ({ ad_archive_id: '2348098406020535', page_id: '646751588512715', is_active: true, start_date: 1789801200, end_date: 1790319600,
  snapshot: { page_name: 'Bonapet', body: { text: 'Copy de prueba' }, title: 'Título', cta_text: 'Shop now', link_url: 'https://www.bonapet.shop/products/test',
    videos: [{ video_hd_url: 'https://video.xx.fbcdn.net/v/test.mp4?sig=one' }], images: [], cards: [] } });
const payload = (ad, next = false) => ({ data: { ad_library_main: { search_results_connection: { edges: [{ node: { collated_results: [ad] } }], page_info: { has_next_page: next, end_cursor: 'cursor' } } } } });

describe('public Meta page normalization', () => {
  it('preserves actual carousel destinations without treating titles or unsafe URLs as evidence', () => {
    const ad = raw();
    ad.snapshot.cards = [
      { title: 'brand.net', link_url: 'https://l.facebook.com/l.php?u=https%3A%2F%2Fbrand.com%2Fproduct' },
      { title: 'Second store', link_url: 'https://brand.net/product' },
      { title: 'guessed.com' }, { link_url: 'javascript:alert(1)' },
    ];
    const normalized = normalizeMetaWebAd(ad, ad.page_id);
    expect(normalized.version.cards.map(card => card.landing_url)).toEqual([
      'https://brand.com/product', 'https://brand.net/product', undefined, null,
    ]);
    ad.snapshot.cards[1].link_url = 'https://brand.org/product';
    expect(normalizeMetaWebAd(ad, ad.page_id).content_hash).not.toBe(normalized.content_hash);
  });
  it('preserves Meta edge and variant order, retaining groups instead of reversing the ranking', () => {
    const input = payload(raw());
    input.data.ad_library_main.search_results_connection.edges = [
      { node: { collated_results: [{ ...raw(), ad_archive_id: '111111' }, { ...raw(), ad_archive_id: '222222' }] } },
      { node: { collated_results: [{ ...raw(), ad_archive_id: '333333' }] } },
    ];
    const ads = parseWebResponse(JSON.stringify(input), raw().page_id)[0].ads;
    expect(ads.map(ad => [ad.source_ad_id, ad.source_order_group])).toEqual([['111111', 0], ['222222', 0], ['333333', 1]]);
  });
  it('keeps active ads active despite the moving end_date and does not version rotating CDN signatures', () => {
    const first = normalizeMetaWebAd(raw(), '646751588512715');
    const changed = raw();
    changed.end_date += 86400;
    changed.snapshot.videos[0].video_hd_url = 'https://video.xx.fbcdn.net/v/test.mp4?sig=two';
    const second = normalizeMetaWebAd(changed, '646751588512715');
    expect(first.status).toBe('active');
    expect(first.source_stop_at).toBeNull();
    expect(second.content_hash).toBe(first.content_hash);
    expect(JSON.stringify(first.version)).not.toContain('sig=');
    expect(first.media[0].kind).toBe('video');
  });
  it('detects changed copy and media', () => {
    const original = raw();
    const changed = raw(); changed.snapshot.body.text = 'Otro texto';
    expect(normalizeMetaWebAd(original, original.page_id).content_hash).not.toBe(normalizeMetaWebAd(changed, original.page_id).content_hash);
  });
  it('reads streamed browser connections but never accepts unrelated page-info as completion', () => {
    expect(parseWebResponse('for (;;);' + JSON.stringify(payload(raw())), raw().page_id)[0]).toMatchObject({ hasNext: false, ads: [{ source_ad_id: raw().ad_archive_id }] });
    expect(parseWebResponse(JSON.stringify({ data: { ad_library_page_info: { page_info: { page_name: 'Bonapet' } } } }), raw().page_id)).toEqual([]);
  });
  it('rejects mismatched pages and schema changes rather than declaring old ads absent', () => {
    expect(() => parseWebResponse(JSON.stringify(payload(raw())), '99999')).toThrow('META_PAGE_MISMATCH');
    const changed = payload(raw()); delete changed.data.ad_library_main.search_results_connection.page_info;
    expect(() => parseWebResponse(JSON.stringify(changed), raw().page_id)).toThrow('META_SCHEMA_CHANGED');
  });
  it('rejects arbitrary media hosts and unsafe landing protocols', () => {
    expect(mediaSource('https://fbcdn.net.evil.test/a.mp4', 'video')).toBeNull();
    expect(mediaSource('http://video.xx.fbcdn.net/a.mp4', 'video')).toBeNull();
    const ad = raw(); ad.snapshot.link_url = 'javascript:alert(1)';
    expect(normalizeMetaWebAd(ad, ad.page_id).landing_url).toBeNull();
  });
  it('stops on source errors delivered with HTTP 200 instead of repeatedly requesting more pages', () => {
    expect(() => parseWebResponse(JSON.stringify({ errors: [{ code: 1675004, message: 'Rate limit exceeded' }] }), raw().page_id)).toThrow('META_RATE_LIMITED');
    expect(() => parseWebResponse('for (;;);' + JSON.stringify({ error: 1675004 }), raw().page_id)).toThrow('META_RATE_LIMITED');
    expect(() => parseWebResponse(JSON.stringify({ errors: [{ message: 'Unknown failure' }] }), raw().page_id)).toThrow('META_SOURCE_ERROR');
  });
});

describe('optional egress proxy', () => {
  it('uses the server IP when no proxy is configured', () => {
    expect(proxyFromEnv({})).toBeUndefined();
    expect(proxyFromEnv({ ADLIB_PROXY_SERVER: '  ' })).toBeUndefined();
  });
  it('keeps credentials out of the server URL', () => {
    expect(proxyFromEnv({ ADLIB_PROXY_SERVER: 'http://proxy.example:8080', ADLIB_PROXY_USERNAME: 'user', ADLIB_PROXY_PASSWORD: 'secret' }))
      .toEqual({ server: 'http://proxy.example:8080', username: 'user', password: 'secret' });
    expect(proxyFromEnv({ ADLIB_PROXY_SERVER: 'socks5://10.0.0.2:1080/' })).toEqual({ server: 'socks5://10.0.0.2:1080' });
  });
  it('routes authenticated SOCKS5 through a local bridge because Chromium cannot authenticate it', async () => {
    const proxy = proxyFromEnv({ ADLIB_PROXY_SERVER: 'socks5://10.0.0.2:1080', ADLIB_PROXY_USERNAME: 'u', ADLIB_PROXY_PASSWORD: 'p' });
    expect(proxy).toEqual({ server: 'socks5://10.0.0.2:1080', username: 'u', password: 'p' });
    let options;
    const browserType = { launch: async value => { options = value; throw new Error('STOP'); } };
    await expect(new MetaWebCollector({ browserType, proxies: [proxy] }).pages({ meta_page_id: '646751588512715' }).next()).rejects.toThrow('STOP');
    expect(options.proxy.server).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(JSON.stringify(options)).not.toContain('"p"');
  });
  it('reads an optional backup, never a backup alone', () => {
    expect(proxiesFromEnv({ ADLIB_PROXY_SERVER: 'http://a.example:1', ADLIB_PROXY_BACKUP_SERVER: 'http://b.example:2' }))
      .toEqual([{ server: 'http://a.example:1' }, { server: 'http://b.example:2' }]);
    expect(proxiesFromEnv({})).toEqual([]);
    expect(() => proxiesFromEnv({ ADLIB_PROXY_BACKUP_SERVER: 'http://b.example:2' })).toThrow('ADLIB_PROXY_INVALID');
  });
  it('fails closed on invalid configuration instead of silently using the server IP', () => {
    for (const env of [
      { ADLIB_PROXY_SERVER: 'proxy.example:8080' },
      { ADLIB_PROXY_SERVER: 'ftp://proxy.example:21' },
      { ADLIB_PROXY_SERVER: 'http://proxy.example' },
      { ADLIB_PROXY_SERVER: 'http://user:secret@proxy.example:8080' },
      { ADLIB_PROXY_SERVER: 'http://proxy.example:8080/path?x=1' },
      { ADLIB_PROXY_SERVER: 'http://proxy.example:8080', ADLIB_PROXY_USERNAME: 'user' },
    ]) expect(() => proxyFromEnv(env)).toThrow('ADLIB_PROXY_INVALID');
  });
  it('launches the browser through the configured proxy', async () => {
    let options;
    const browserType = { launch: async value => { options = value; throw new Error('STOP'); } };
    const collector = new MetaWebCollector({ browserType, proxies: [{ server: 'http://proxy.example:8080' }] });
    await expect(collector.pages({ meta_page_id: '646751588512715' }).next()).rejects.toThrow('STOP');
    expect(options.proxy).toEqual({ server: 'http://proxy.example:8080' });
  });
});

describe('backup proxy', () => {
  const brand = { meta_page_id: '646751588512715' };
  const collect = async collector => { const pages = []; for await (const page of collector.pages(brand)) pages.push(page); return pages; };
  const collectorWith = (behaviour, proxyCooldowns = new ProxyCooldowns()) => {
    const collector = new MetaWebCollector({ proxies: [{ server: 'http://a.example:1' }, { server: 'http://b.example:2' }], proxyCooldowns });
    const used = [];
    collector.pagesVia = async function* (_, proxy) { used.push(proxy.server); yield* behaviour(proxy.server); };
    return { collector, used };
  };
  it('switches to the backup when the primary proxy cannot connect', async () => {
    const { collector, used } = collectorWith(async function* (server) {
      if (server === 'http://a.example:1') throw new Error('META_PROXY_UNAVAILABLE');
      yield { ads: [], page: 1 };
    });
    expect(await collect(collector)).toEqual([{ ads: [], page: 1 }]);
    expect(used).toEqual(['http://a.example:1', 'http://b.example:2']);
  });
  it('reaches a third configured proxy when the first two cannot connect',async()=>{
    const proxies=['a','b','c'].map(name=>({server:`http://${name}.example:8000`}));
    const collector=new MetaWebCollector({proxies,proxyCooldowns:new ProxyCooldowns()}),used=[];
    collector.pagesVia=async function* (_,proxy){used.push(proxy.server);if(proxy!==proxies[2])throw new Error('META_PROXY_UNAVAILABLE');yield {ads:[],page:1};};
    expect(await collect(collector)).toEqual([{ads:[],page:1}]);expect(used).toEqual(proxies.map(p=>p.server));
  });
  it('exhausts both configured routes once and reports the remaining pause', async () => {
    const { collector, used } = collectorWith(async function* () { yield* []; throw new Error('META_RATE_LIMITED'); });
    await expect(collect(collector)).rejects.toMatchObject({ message: 'META_RATE_LIMITED', retryAfterMs: expect.any(Number) });
    expect(used).toEqual(['http://a.example:1', 'http://b.example:2']);
    used.length = 0;
    await expect(collect(collector)).rejects.toThrow('META_RATE_LIMITED');
    expect(used).toEqual([]);
  });
  it.each(['META_PROXY_UNAVAILABLE', 'META_RATE_LIMITED'])('preserves partial ads and deduplicates the restarted scan after %s', async code => {
    const first = { source_ad_id: '1', content_hash: 'a', status: 'active' };
    const second = { source_ad_id: '2', content_hash: 'b', status: 'active' };
    const { collector, used } = collectorWith(async function* (server) {
      if (server === 'http://a.example:1') { yield { ads: [first], page: 1 }; throw new Error(code); }
      yield { ads: [first, second], page: 1 };
    });
    const pages = await collect(collector);
    expect(pages.flatMap(page => page.ads)).toEqual([first, second]);
    expect(used).toEqual(['http://a.example:1', 'http://b.example:2']);
  });
  it('uses the healthy route for subsequent brands until the primary cooldown expires', async () => {
    let now = 0;
    const cooldowns = new ProxyCooldowns(() => now);
    const behaviour = async function* (server) {
      if (server === 'http://a.example:1') throw new Error('META_RATE_LIMITED');
      yield { ads: [], page: 1 };
    };
    const first = collectorWith(behaviour, cooldowns);
    await collect(first.collector);
    const second = collectorWith(behaviour, cooldowns);
    await collect(second.collector);
    expect(second.used).toEqual(['http://b.example:2']);
    now = 15 * 60_000 + 1;
    const third = collectorWith(behaviour, cooldowns);
    await collect(third.collector);
    expect(third.used).toEqual(['http://a.example:1', 'http://b.example:2']);
  });
  it('never adds a direct route when both proxies cannot connect', async () => {
    const { collector, used } = collectorWith(async function* () { yield* []; throw new Error('META_PROXY_UNAVAILABLE'); });
    await expect(collect(collector)).rejects.toThrow('META_PROXY_UNAVAILABLE');
    expect(used).toEqual(['http://a.example:1', 'http://b.example:2']);
  });
  it.each(['META_ACCESS_REQUIRED', 'META_PAGE_MISMATCH', 'META_SCHEMA_CHANGED', 'META_SOURCE_ERROR'])('does not restart on %s', async code => {
    const { collector, used } = collectorWith(async function* () { yield* []; throw new Error(code); });
    await expect(collect(collector)).rejects.toThrow(code);
    expect(used).toEqual(['http://a.example:1']);
  });
  it('closes the limited browser before opening a separate empty context for the backup', async () => {
    const events = [], contexts = [];
    const browserType = { launch: vi.fn(async ({ proxy }) => {
      const primary = proxy.server === 'http://a.example:1';
      events.push(`launch:${primary}`);
      return {
        newContext: async options => {
          contexts.push(options);
          return {
            newPage: async () => ({
              route: async () => {}, on: () => {},
              goto: async () => ({ status: () => primary ? 429 : 200 }),
              url: () => 'https://www.facebook.com/ads/library/',
              locator: () => ({ allTextContents: async () => [JSON.stringify(payload(raw()))] }),
            }),
            close: async () => events.push(`contextClosed:${primary}`),
          };
        },
        close: async () => events.push(`browserClosed:${primary}`),
      };
    }) };
    const collector = new MetaWebCollector({ browserType, proxyCooldowns: new ProxyCooldowns(),
      proxies: [{ server: 'http://a.example:1' }, { server: 'http://b.example:2' }] });
    expect((await collect(collector)).flatMap(page => page.ads)).toHaveLength(1);
    expect(contexts).toHaveLength(2);
    for (const context of contexts) expect(context.storageState).toEqual({ cookies: [], origins: [] });
    expect(contexts[0]).not.toBe(contexts[1]);
    expect(events).toEqual(['launch:true', 'contextClosed:true', 'browserClosed:true', 'launch:false', 'contextClosed:false', 'browserClosed:false']);
  });
});
