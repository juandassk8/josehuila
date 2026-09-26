import { describe, expect, it, vi } from 'vitest';
import { crawlBrand, processCrawlJob } from './worker.mjs';
import { metaRateLimitError } from '../../api/_lib/adLibrary/retryPolicy.js';

function fakeClient() {
  const rpc = vi.fn(async () => ({ data: 0, error: null }));
  const updates = [];
  const from = table => {
    const query = {
      select: () => query, eq: () => query, limit: () => query,
      insert: () => query, update: value => { updates.push({ table, value }); return query; },
      single: async () => ({ data: table === 'ad_library_brands'
        ? { id: 'brand-1', source: 'meta_official', name: 'Página 123' }
        : { id: 'run-1', started_at: '2026-09-25T12:00:00Z' }, error: null }),
      then: resolve => Promise.resolve({ data: [{ id: 'follow-1' }], error: null }).then(resolve),
    };
    return query;
  };
  return { client: { from, rpc }, rpc, updates };
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

  it('retains a partial failure and schedules the remaining proxy pause rather than six hours', async () => {
    const { client, rpc, updates } = fakeClient();
    const collectorFactory = () => ({ async *pages() { yield { ads: [] }; throw metaRateLimitError(120_000); } });
    const started = Date.now();
    await expect(crawlBrand('brand-1', { client, collectorFactory })).rejects.toMatchObject({ message: 'META_RATE_LIMITED', retryAfterMs: 120_000 });
    expect(rpc).not.toHaveBeenCalledWith('ad_library_finish_crawl', expect.anything());
    expect(updates.find(update => update.table === 'ad_library_crawl_runs').value).toMatchObject({ status: 'failed', complete_scan: false, pages_seen: 1 });
    const next = Date.parse(updates.find(update => update.table === 'ad_library_brands').value.next_crawl_at);
    expect(next).toBeGreaterThanOrEqual(started + 120_000);
    expect(next).toBeLessThanOrEqual(Date.now() + 120_000);
  });
});

describe('source queue retry', () => {
  const job = () => ({ data: { brandId: 'brand-1' }, updateProgress: vi.fn() });
  it('keeps progress and completes without pausing after successful collector failover', async () => {
    const selectedJob = job(), worker = { rateLimit: vi.fn() };
    const crawl = vi.fn(async (_, { onProgress }) => { await onProgress({ pagesSeen: 2, adsSeen: 9 }); return { adsSeen: 9 }; });
    await expect(processCrawlJob(selectedJob, worker, { crawl })).resolves.toEqual({ adsSeen: 9 });
    expect(selectedJob.updateProgress).toHaveBeenCalledWith({ pagesSeen: 2, adsSeen: 9 });
    expect(worker.rateLimit).not.toHaveBeenCalled();
  });
  it('pauses only for the remaining interval after all routes fail', async () => {
    const worker = { rateLimit: vi.fn(async () => {}) };
    const crawl = async () => { throw metaRateLimitError(75_000); };
    await expect(processCrawlJob(job(), worker, { crawl })).rejects.toThrow('bullmq:rateLimitExceeded');
    expect(worker.rateLimit).toHaveBeenCalledWith(75_000);
  });
  it('preserves ordinary errors and their existing job retry behavior', async () => {
    const worker = { rateLimit: vi.fn() };
    const crawl = async () => { throw new Error('META_SCHEMA_CHANGED'); };
    await expect(processCrawlJob(job(), worker, { crawl })).rejects.toThrow('META_SCHEMA_CHANGED');
    expect(worker.rateLimit).not.toHaveBeenCalled();
  });
});
