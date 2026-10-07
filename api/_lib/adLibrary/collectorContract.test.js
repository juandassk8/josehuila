import { describe, expect, it, vi } from 'vitest';
import { CollectorCoordinator, completedCollection } from './collectorContract.js';

const brand = { source: 'meta_web', meta_page_id: '123456', country: 'ALL' };
const ad = { source_ad_id: '1', content_hash: 'hash', status: 'active' };
const consume = async collector => { const result = []; for await (const page of collector.pages(brand)) result.push(page); return result; };
const provider = (engine, pages) => ({ engine, create: () => ({ pages }) });

describe('collector coordination', () => {
  it('closes the primary before fallback, deduplicates, and publishes the fallback proof', async () => {
    const events = [], onAttempt = vi.fn();
    const collector = new CollectorCoordinator([
      provider('meta_web', async function* () {
        try { yield { ads: [ad] }; throw new Error('META_PAGINATION_STALLED'); }
        finally { events.push('closed'); }
      }),
      provider('scrapling', async function* () {
        events.push('fallback'); yield { ads: [ad, { ...ad, source_ad_id: '2' }] };
        yield completedCollection(brand, 'scrapling');
      }),
    ], { onAttempt });
    const pages = await consume(collector);
    expect(events).toEqual(['closed', 'fallback']);
    expect(pages.flatMap(page => page.ads).map(item => item.source_ad_id)).toEqual(['1', '2']);
    expect(pages.at(-1).completion.engine).toBe('scrapling');
    expect(onAttempt.mock.calls.map(([a]) => a.status)).toEqual(['running', 'failed', 'running', 'complete']);
  });
  it.each(['META_RATE_LIMITED', 'META_ACCESS_REQUIRED', 'META_SCHEMA_CHANGED', 'META_PROXY_UNAVAILABLE', 'DATABASE_ERROR'])('does not mask %s with another engine', async code => {
    const fallback = vi.fn();
    const collector = new CollectorCoordinator([
      provider('meta_web', async function* () { yield { ads: [] }; throw new Error(code); }),
      { engine: 'scrapling', create: fallback },
    ]);
    await expect(consume(collector)).rejects.toThrow(code);
    expect(fallback).not.toHaveBeenCalled();
  });
  it('does not join two partial inventories into a complete result', async () => {
    const collector = new CollectorCoordinator([
      provider('meta_web', async function* () { yield { ads: [ad] }; }),
      provider('scrapling', async function* () { yield { ads: [{ ...ad, source_ad_id: '2' }] }; }),
    ]);
    await expect(consume(collector)).rejects.toThrow('COLLECTION_INCOMPLETE');
  });
  it('does not publish a terminal marker if teardown fails', async () => {
    const received = [];
    const collector = new CollectorCoordinator([provider('meta_web', async function* () {
      yield completedCollection(brand, 'meta_web'); throw new Error('CLOSE_FAILED');
    })]);
    await expect((async () => { for await (const page of collector.pages(brand)) received.push(page); })()).rejects.toThrow('CLOSE_FAILED');
    expect(received).toEqual([]);
  });
  it('does not start another engine if attempt persistence fails', async () => {
    const start = vi.fn();
    await expect(consume(new CollectorCoordinator([{ engine: 'meta_web', create: start }], {
      onAttempt: async () => { throw new Error('DATABASE_ERROR'); },
    }))).rejects.toThrow('DATABASE_ERROR');
    expect(start).not.toHaveBeenCalled();
  });
});
