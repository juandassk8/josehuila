import { describe, expect, it, vi } from 'vitest';
import { crawlBrand, processCrawlJob } from './worker.mjs';
import { metaRateLimitError } from '../../api/_lib/adLibrary/retryPolicy.js';
import { completedCollection } from '../../api/_lib/adLibrary/collectorContract.js';
import { DEFAULT_SETTINGS } from '../../api/_lib/adminOperations/settings.js';
const loadSettings = async () => DEFAULT_SETTINGS;

function fakeClient() {
  const rpc = vi.fn(async () => ({ data: 0, error: null }));
  const updates = [];
  const from = table => {
    const query = {
      select: () => query, eq: () => query, limit: () => query,
      insert: () => query, update: value => { updates.push({ table, value }); return query; },
      single: async () => ({ data: table === 'ad_library_brands'
        ? { id: 'brand-1', source: 'meta_official', meta_page_id: '123456', name: 'Página 123' }
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
    const collectorFactory = () => ({ async *pages(brand) { yield { ads: [] }; yield completedCollection(brand, 'meta_official'); } });
    const onProgress = vi.fn();
    await crawlBrand('brand-1', { client, collectorFactory, onProgress });
    expect(onProgress).toHaveBeenNthCalledWith(1, { pagesSeen: 0, adsSeen: 0 });
    expect(onProgress).toHaveBeenLastCalledWith({ pagesSeen: 1, adsSeen: 0 });
    expect(rpc).toHaveBeenCalledWith('ad_library_finish_crawl', {
      p_brand_id: 'brand-1', p_started_at: '2026-09-25T12:00:00Z', p_complete: true,
    });
  });

  it.each(['empty', 'partial', 'wrong_scope', 'late_failure', 'after_completion'])('never reconciles an unverified scan: %s', async mode => {
    const { client, rpc } = fakeClient();
    const collectorFactory = () => ({ async *pages(brand) {
      if (mode === 'empty') return;
      yield { ads: [] };
      if (mode === 'partial') return;
      yield completedCollection(mode === 'wrong_scope' ? { ...brand, meta_page_id: '999999' } : brand, 'meta_official');
      if (mode === 'late_failure') throw new Error('CLOSE_FAILED');
      if (mode === 'after_completion') yield { ads: [] };
    } });
    await expect(crawlBrand('brand-1', { client, collectorFactory })).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalledWith('ad_library_finish_crawl', expect.anything());
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
  const loadProxies = async () => ({proxies:[]});
  const job = () => ({ data: { brandId: 'brand-1' }, updateProgress: vi.fn() });
  it('keeps progress and completes without pausing after successful collector failover', async () => {
    const selectedJob = job(), worker = { rateLimit: vi.fn() };
    const crawl = vi.fn(async (_, { onProgress }) => { await onProgress({ pagesSeen: 2, adsSeen: 9 }); return { adsSeen: 9 }; });
    await expect(processCrawlJob(selectedJob, worker, { crawl, loadSettings, loadProxies })).resolves.toEqual({ adsSeen: 9 });
    expect(selectedJob.updateProgress).toHaveBeenCalledWith({ pagesSeen: 2, adsSeen: 9 });
    expect(worker.rateLimit).not.toHaveBeenCalled();
  });
  it('pauses only for the remaining interval after all routes fail', async () => {
    const worker = { rateLimit: vi.fn(async () => {}) };
    const crawl = async () => { throw metaRateLimitError(75_000); };
    await expect(processCrawlJob(job(), worker, { crawl, loadSettings, loadProxies })).rejects.toThrow('bullmq:rateLimitExceeded');
    expect(worker.rateLimit).toHaveBeenCalledWith(75_000);
  });
  it('preserves ordinary errors and their existing job retry behavior', async () => {
    const worker = { rateLimit: vi.fn() };
    const crawl = async () => { throw new Error('META_SCHEMA_CHANGED'); };
    await expect(processCrawlJob(job(), worker, { crawl, loadSettings, loadProxies })).rejects.toThrow('META_SCHEMA_CHANGED');
    expect(worker.rateLimit).not.toHaveBeenCalled();
  });
  it('uses new proxy settings at the next job without a restart or a silent direct fallback', async () => {
    const crawl=vi.fn(), first=[{server:'http://1.1.1.1:8000'}], second=[{server:'http://8.8.8.8:8000'}];
    const loadProxies=vi.fn().mockResolvedValueOnce({proxies:first}).mockResolvedValueOnce({proxies:second}).mockRejectedValueOnce(new Error('PROXY_CONFIGURATION_UNAVAILABLE'));
    await processCrawlJob(job(),{}, {crawl,loadSettings,loadProxies});
    await processCrawlJob(job(),{}, {crawl,loadSettings,loadProxies});
    expect(crawl.mock.calls[0][1].proxies).toEqual(first);expect(crawl.mock.calls[1][1].proxies).toEqual(second);
    await expect(processCrawlJob(job(),{}, {crawl,loadSettings,loadProxies})).rejects.toThrow('PROXY_CONFIGURATION_UNAVAILABLE');
    expect(crawl).toHaveBeenCalledTimes(2);
  });
});
