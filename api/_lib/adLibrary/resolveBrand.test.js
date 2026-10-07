import { describe, it, expect, vi } from 'vitest';
import { resolveBrand, readPageIdentity } from './resolveBrand.js';
import { ProxyCooldowns } from './proxyCooldowns.js';
const candidate = { pageId: '123456', name: 'Public name' };
describe('safe public brand resolution', () => {
  it('honors Meta rate limits delivered as GraphQL errors with HTTP 200', async () => {
    let listener;
    const page = { on: (_event, fn) => { listener = fn; }, route: async () => {},
      goto: async () => { listener({ url: () => 'https://www.facebook.com/api/graphql/', status: () => 200, text: async () => JSON.stringify({ errors: [{ code: 1675004 }] }) }); return { status: () => 200 }; },
      url: () => 'https://www.facebook.com/Brand', content: async () => '', waitForTimeout: async () => {} };
    const close = vi.fn(), browserType = { launch: async () => ({ newContext: async () => ({ newPage: async () => page }), close }) };
    await expect(readPageIdentity({ url: 'https://www.facebook.com/Brand', kind: 'fanpage' }, undefined, { browserType })).rejects.toThrow('META_RATE_LIMITED');
    expect(close).toHaveBeenCalled();
  });
  it('follows explicit website links and returns multiple verified identities for selection', async () => {
    const readIdentity = vi.fn(async input => [{ ...candidate, pageId: input.url.includes('Second') ? '987654' : '123456' }]);
    const fetchWebsite = vi.fn(async () => new Response('<a href="https://facebook.com/First/">1</a><a href="https://facebook.com/Second/">2</a>', { headers: { 'content-type': 'text/html' } }));
    expect((await resolveBrand('https://shop.example', { readIdentity, fetchWebsite })).candidates).toHaveLength(2);
    expect(readIdentity).toHaveBeenCalledTimes(2);
  });
  it('does not guess an identity from the web title or fetch private URLs', async () => {
    const readIdentity = vi.fn(), fetchWebsite = vi.fn(async () => new Response('<title>My Brand</title>', { headers: { 'content-type': 'text/html' } }));
    await expect(resolveBrand('https://shop.example', { readIdentity, fetchWebsite })).rejects.toThrow('BRAND_WEBSITE_NO_FANPAGE');
    await expect(resolveBrand('https://127.0.0.1', { readIdentity, fetchWebsite })).rejects.toThrow('BRAND_URL_INVALID');
    expect(fetchWebsite).toHaveBeenCalledTimes(1); expect(readIdentity).not.toHaveBeenCalled();
  });
  it('respects existing proxy cooldowns and never silently falls back to direct', async () => {
    const proxy = { server: 'http://proxy.example:8080' }, cooldown = new ProxyCooldowns(); cooldown.block(proxy, 60000);
    const readIdentity = vi.fn();
    await expect(resolveBrand('https://facebook.com/Brand', { proxies: [proxy], proxyCooldowns: cooldown, readIdentity })).rejects.toThrow('META_RATE_LIMITED');
    expect(readIdentity).not.toHaveBeenCalled();
  });
  it('uses the configured fallback for a dead proxy', async () => {
    const proxies = [{ server: 'http://first.example:8080' }, { server: 'http://second.example:8080' }];
    const readIdentity = vi.fn().mockRejectedValueOnce(Error('META_PROXY_UNAVAILABLE')).mockResolvedValueOnce([candidate]);
    expect((await resolveBrand('https://facebook.com/Brand', { proxies, readIdentity })).candidates).toEqual([candidate]);
    expect(readIdentity.mock.calls[1][1]).toBe(proxies[1]);
  });
});
