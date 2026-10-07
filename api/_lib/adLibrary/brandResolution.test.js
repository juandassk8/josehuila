import { describe, it, expect, vi } from 'vitest';
import { getResolution, requestResolution } from './brandResolution.js';
const id = 'resolve-00000000-0000-4000-8000-000000000000';
describe('brand resolution ownership', () => {
  it('reuses a public catalog identity without contacting Meta or accepting a typed name', async () => {
    const brand = { id: '00000000-0000-4000-8000-000000000000', meta_page_id: '123456', name: 'Canonical fanpage' };
    const query = { select: () => query, eq: () => query, limit: async () => ({ data: [brand] }), maybeSingle: async () => ({ data: brand }) };
    const client = { from: () => query }, queue = { add: vi.fn() }, redis = {};
    expect(await requestResolution('mine', 'me', 'https://facebook.com/profile.php?id=123456', { client, queue, redis })).toEqual({ resolutionId: `catalog-${brand.id}` });
    expect(await getResolution('mine', 'me', `catalog-${brand.id}`, { client, queue })).toMatchObject({ cached: true, candidates: [{ name: 'Canonical fanpage', pageId: '123456' }] });
    expect(queue.add).not.toHaveBeenCalled();
  });
  it('never reveals another user or company resolution', async () => {
    const job = { name: 'resolve-brand', data: { companyId: 'mine', userId: 'me' }, getState: vi.fn() };
    const queue = { getJob: async () => job };
    for (const [company, user] of [['other', 'me'], ['mine', 'other']]) await expect(getResolution(company, user, id, { queue })).rejects.toMatchObject({ status: 404 });
    expect(job.getState).not.toHaveBeenCalled();
  });
  it('sanitizes worker errors instead of returning URLs, secrets or stack traces', async () => {
    const job = { name: 'resolve-brand', data: { companyId: 'mine', userId: 'me' }, getState: async () => 'failed', failedReason: 'secret-url token here' };
    expect((await getResolution('mine', 'me', id, { queue: { getJob: async () => job } })).error).not.toContain('secret');
  });
  it('reuses a pending identical request and blocks concurrent different searches', async () => {
    const job = { id, data: { companyId: 'mine', userId: 'me', url: 'https://www.facebook.com/Brand' }, getState: async () => 'waiting' };
    const queue = { getJob: async () => job, add: vi.fn() }, redis = { get: async () => id };
    expect(await requestResolution('mine', 'me', 'https://facebook.com/Brand', { queue, redis })).toEqual({ resolutionId: id });
    await expect(requestResolution('mine', 'me', 'https://facebook.com/Other', { queue, redis })).rejects.toMatchObject({ status: 429 });
    expect(queue.add).not.toHaveBeenCalled();
  });
});
