import { describe, expect, it } from 'vitest';
import { collectionStatus } from './collectionStatus.js';
import { crawlQueueStatus } from './queue.js';

const ready = { available: true, workers: 1 };
describe('collection status', () => {
  it('reports an administrative pause without attributing it to Meta, but lets running work finish', () => {
    expect(collectionStatus({}, { ...ready, paused: true, retryAt: 'later', job: { state: 'waiting' } }))
      .toMatchObject({ phase: 'paused', retryAt: null });
    expect(collectionStatus({}, { ...ready, paused: true, job: { state: 'active' } }).phase).toBe('running');
  });
  it('distinguishes a new queued brand under a shared cooldown from a completed empty scan', () => {
    const queue = { ...ready, retryAt: '2026-09-26T07:22:25Z', job: { state: 'waiting' } };
    expect(collectionStatus({}, queue)).toMatchObject({ phase: 'rate_limited', queued: true, hasCompleteScan: false, retryAt: queue.retryAt });
    expect(collectionStatus({ last_complete_scan_at: '2026-09-25T00:00:00Z' }, { ...ready, retryAt: queue.retryAt })).toMatchObject({ phase: 'ready', queued: false, hasCompleteScan: true, retryAt: null });
  });
  it('keeps available history and the failure visible after a partial crawl', () => {
    expect(collectionStatus({ last_complete_scan_at: '2026-09-25T00:00:00Z' }, ready, { status: 'failed', error_code: 'CRAWL_FAILED' }))
      .toMatchObject({ phase: 'failed', hasCompleteScan: true, errorCode: 'CRAWL_FAILED' });
  });
  it('reports active work before a cooldown and drops stale progress on waiting jobs', () => {
    const job = { state: 'active', progress: { adsSeen: 29 } };
    expect(collectionStatus({}, { ...ready, job, retryAt: 'later' })).toMatchObject({ phase: 'running', progress: { adsSeen: 29 } });
    expect(collectionStatus({}, { ...ready, job: { ...job, state: 'waiting' } })).toMatchObject({ phase: 'queued', progress: null });
  });
  it('does not treat an offline worker or missing job as an empty completed scan', () => {
    expect(collectionStatus({}, { available: false }).phase).toBe('unavailable');
    expect(collectionStatus({}, { ...ready, workers: 0 }).phase).toBe('unavailable');
    expect(collectionStatus({}, ready).phase).toBe('pending');
  });
  it('does not change the catalog revision when only the cooldown expiry drifts', () => {
    const brand = {}, run = { id: 'run', status: 'failed', ads_seen: 29 };
    expect(collectionStatus(brand, { ...ready, retryAt: 'one' }, run).revision)
      .toBe(collectionStatus(brand, { ...ready, retryAt: 'two' }, run).revision);
  });
  it('reads the existing brand job without enqueueing or clearing the limiter', async () => {
    const result = await crawlQueueStatus('brand', { queueFactory: () => ({
      getJob: async id => { expect(id).toBe('brand-brand'); return { getState: async () => 'waiting', progress: 0 }; },
      getRateLimitTtl: async () => 60_000, isPaused: async () => false, getWorkersCount: async () => 1,
    }) });
    expect(result).toMatchObject({ available: true, workers: 1, paused: false, job: { state: 'waiting', progress: null } });
    expect(Date.parse(result.retryAt)).toBeGreaterThan(Date.now());
  });
  it('bounds a disconnected queue lookup and reports unavailability', async () => {
    expect(await crawlQueueStatus('brand', { queueFactory: () => { throw new Error('OFFLINE'); } })).toEqual({ available: false });
    expect(await crawlQueueStatus('brand', { timeoutMs: 5, queueFactory: () => ({
      getJob: () => new Promise(() => {}), getRateLimitTtl: async () => 0, isPaused: async () => false, getWorkersCount: async () => 1,
    }) })).toEqual({ available: false });
  });
});
