import { describe, expect, it, vi } from 'vitest';
import { CRAWL_PRIORITY, enqueueBrand } from './queue.js';

function fakeQueue(job = null) {
  const queue = { add: vi.fn(async (name, data, opts) => ({ name, data, opts })), getJob: vi.fn(async () => job) };
  return () => queue;
}
function fakeJob(priority, state) {
  return { priority, getState: vi.fn(async () => state), changePriority: vi.fn(async () => {}) };
}

describe('crawl priority', () => {
  it('puts a newly followed brand ahead of scheduled refreshes', async () => {
    const queueFactory = fakeQueue();
    const created = await enqueueBrand('b1', { reason: 'first_import', queueFactory });
    expect(created.opts).toMatchObject({ jobId: 'brand-b1', priority: CRAWL_PRIORITY.first_import, attempts: 3 });
    const scheduled = await enqueueBrand('b2', { queueFactory });
    expect(scheduled.opts.priority).toBe(CRAWL_PRIORITY.scheduled);
    expect(CRAWL_PRIORITY.first_import).toBeLessThan(CRAWL_PRIORITY.manual);
    expect(CRAWL_PRIORITY.manual).toBeLessThan(CRAWL_PRIORITY.scheduled);
  });
  it('promotes a waiting job instead of duplicating it', async () => {
    const job = fakeJob(CRAWL_PRIORITY.scheduled, 'prioritized');
    const queueFactory = fakeQueue(job);
    expect(await enqueueBrand('b1', { reason: 'first_import', queueFactory })).toBe(job);
    expect(job.changePriority).toHaveBeenCalledWith({ priority: CRAWL_PRIORITY.first_import });
    expect(queueFactory().add).not.toHaveBeenCalled();
  });
  it('moves legacy unprioritized jobs behind interactive ones', async () => {
    const job = fakeJob(0, 'waiting');
    await enqueueBrand('b1', { queueFactory: fakeQueue(job) });
    expect(job.changePriority).toHaveBeenCalledWith({ priority: CRAWL_PRIORITY.scheduled });
  });
  it('never demotes a job or touches one that is running or retrying', async () => {
    const urgent = fakeJob(CRAWL_PRIORITY.first_import, 'prioritized');
    await enqueueBrand('b1', { queueFactory: fakeQueue(urgent) });
    expect(urgent.changePriority).not.toHaveBeenCalled();
    for (const state of ['active', 'delayed']) {
      const job = fakeJob(CRAWL_PRIORITY.scheduled, state);
      await enqueueBrand('b1', { reason: 'manual', queueFactory: fakeQueue(job) });
      expect(job.changePriority).not.toHaveBeenCalled();
    }
  });
});
