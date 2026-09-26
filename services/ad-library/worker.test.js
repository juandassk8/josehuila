import { describe, expect, it, vi } from 'vitest';
import { crawlBrand } from './worker.mjs';

function fakeClient() {
  const rpc = vi.fn(async () => ({ data: 0, error: null }));
  const from = table => {
    const query = {
      select: () => query, eq: () => query, limit: () => query,
      insert: () => query, update: () => query,
      single: async () => ({ data: table === 'ad_library_brands'
        ? { id: 'brand-1', source: 'meta_official', name: 'Página 123' }
        : { id: 'run-1', started_at: '2026-09-25T12:00:00Z' }, error: null }),
      then: resolve => Promise.resolve({ data: [{ id: 'follow-1' }], error: null }).then(resolve),
    };
    return query;
  };
  return { client: { from, rpc }, rpc };
}

describe('ad library worker completion', () => {
  it('never marks absent ads after a partial failed scan', async () => {
    const { client, rpc } = fakeClient();
    const collectorFactory = () => ({ async *pages() {
      yield { ads: [] };
      throw new Error('META_HTTP_429');
    } });
    await expect(crawlBrand('brand-1', { client, collectorFactory })).rejects.toThrow('META_HTTP_429');
    expect(rpc).not.toHaveBeenCalledWith('ad_library_finish_crawl', expect.anything());
  });

  it('marks a scan complete only after pagination ends', async () => {
    const { client, rpc } = fakeClient();
    const collectorFactory = () => ({ async *pages() { yield { ads: [] }; } });
    const onProgress = vi.fn();
    await crawlBrand('brand-1', { client, collectorFactory, onProgress });
    expect(onProgress).toHaveBeenNthCalledWith(1, { pagesSeen: 0, adsSeen: 0 });
    expect(onProgress).toHaveBeenLastCalledWith({ pagesSeen: 1, adsSeen: 0 });
    expect(rpc).toHaveBeenCalledWith('ad_library_finish_crawl', {
      p_brand_id: 'brand-1', p_started_at: '2026-09-25T12:00:00Z', p_complete: true,
    });
  });
});
