import { describe, expect, it, vi } from 'vitest';
import { ScraplingCollector, jsonLines } from './scrapling.js';
import { ProxyCooldowns } from './proxyCooldowns.js';

const brand = { source: 'meta_web', meta_page_id: '123456', country: 'ALL' };
const raw = (next = false, pageId = brand.meta_page_id) => JSON.stringify({ data: { ad_library_main: { search_results_connection: {
  edges: [{ node: { ad_archive_id: '98765', page_id: pageId, is_active: true, snapshot: { body: { text: 'Copy verificado' } } } }],
  page_info: { has_next_page: next, end_cursor: next ? 'next' : null },
} } } });
const capture = (next = false, pageId) => ({ type: 'capture', body: raw(next, pageId) });
const done = { type: 'done' };
const response = frames => new Response(frames.map(frame => JSON.stringify(frame) + '\n').join(''), { headers: { 'content-type': 'application/x-ndjson' } });
const make = (frames, options = {}) => new ScraplingCollector({ endpoint: 'http://127.0.0.1:3081', token: 'a'.repeat(32), proxies: [],
  proxyCooldowns: new ProxyCooldowns(), fetchImpl: async () => response(frames), ...options });
const consume = async collector => { const result = []; for await (const page of collector.pages(brand)) result.push(page); return result; };

describe('Scrapling capture transport', () => {
  it('normalizes captured evidence and accepts only a terminal source page plus a finished transport', async () => {
    const pages = await consume(make([capture(true), capture(), done]));
    expect(pages.flatMap(page => page.ads)).toHaveLength(1);
    expect(pages[0].ads[0].body).toBe('Copy verificado');
    expect(pages.at(-1).completion).toMatchObject({ engine: 'scrapling', pageId: brand.meta_page_id });
  });
  it.each([[done], [capture(true), done], [capture()], [capture(), done, capture()]])('rejects incomplete or invalid transcripts: %j', async frames => {
    await expect(consume(make(frames))).rejects.toThrow();
  });
  it('rejects a different advertiser', async () => {
    await expect(consume(make([capture(false, '666666'), done]))).rejects.toThrow('META_PAGE_MISMATCH');
  });
  it('shares paused routes and never calls the service for a blocked route', async () => {
    const proxy = { server: 'http://proxy.example:1234' }, cooldowns = new ProxyCooldowns();
    cooldowns.block(proxy, 60_000);
    const fetchImpl = vi.fn();
    await expect(consume(make([], { proxies: [proxy], proxyCooldowns: cooldowns, fetchImpl }))).rejects.toThrow('META_RATE_LIMITED');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('passes the third route to the sidecar after two failed connections',async()=>{
    const proxies=['a','b','c'].map(name=>({server:`http://${name}.example:8000`}));
    const fetchImpl=vi.fn(async(_,options)=>JSON.parse(options.body).proxy.server===proxies[2].server
      ?response([capture(),done]):response([{type:'error',code:'META_PROXY_UNAVAILABLE'}]));
    const pages=await consume(make([],{proxies,fetchImpl}));
    expect(pages.at(-1).completion.engine).toBe('scrapling');
    expect(fetchImpl.mock.calls.map(([,opts])=>JSON.parse(opts.body).proxy.server)).toEqual(proxies.map(p=>p.server));
  });
  it('persists the source Retry-After received through the sidecar', async () => {
    const cooldowns = new ProxyCooldowns(() => 0);
    await expect(consume(make([{ type: 'error', code: 'META_RATE_LIMITED', retryAfterMs: 7_200_000 }], {
      proxyCooldowns: cooldowns,
    }))).rejects.toMatchObject({ message: 'META_RATE_LIMITED', retryAfterMs: 7_200_000 });
    expect(cooldowns.remaining()).toBe(7_200_000);
  });
  it('sends only the explicit proxy and aborts the connection on reader cancellation', async () => {
    const fetchImpl = vi.fn(async () => response([capture(true), done]));
    const proxy = { server: 'http://proxy.example:1234', username: 'name', password: 'secret' };
    const iterator = make([], { proxies: [proxy], fetchImpl }).pages(brand);
    await iterator.next();
    await iterator.return();
    const options = fetchImpl.mock.calls[0][1];
    expect(JSON.parse(options.body).proxy).toEqual(proxy);
    expect(options.signal.aborted).toBe(true);
    expect(options.redirect).toBe('error');
  });
  it.each(['https://outside.example/crawl', 'http://localhost:3081', 'http://127.0.0.1:3081/?token=secret'])('rejects a non-loopback/configurable forwarding target %s', endpoint => {
    expect(() => make([], { endpoint })).toThrow('SCRAPLING_CONFIG_INVALID');
  });
  it('handles split UTF-8 frames and rejects a truncated final line', async () => {
    const bytes = new TextEncoder().encode('{"text":"ñ"}\n');
    const stream = { async *[Symbol.asyncIterator]() { yield bytes.slice(0, 10); yield bytes.slice(10); } };
    const output = []; for await (const frame of jsonLines(stream)) output.push(frame);
    expect(output).toEqual([{ text: 'ñ' }]);
    const truncated = new Response('{"type":"done"}').body;
    await expect((async () => { for await (const frame of jsonLines(truncated)) void frame; })()).rejects.toThrow('SCRAPLING_PROTOCOL_INVALID');
  });
});
