import { describe, it, expect, vi } from 'vitest';
import { createBrandRequest, publicBrandRequest, listBrandRequests, cancelBrandRequest, processBrandRequest, scheduleBrandRequests, resolveKnownBrandRequest } from './brandRequests.js';

const id = '10000000-0000-4000-8000-000000000001';
function fixture(initial = {}, known = []) {
  const row = { id, company_id: 'c1', created_by: 'u1', input_url: 'https://bonapet.net/', status: 'pending', attempts: 1, candidates: [], ...initial };
  const calls = [];
  const client = { rpc: vi.fn(async (_name, args) => { row.lease_token = args.p_token; row.status = 'resolving'; return { data: { ...row }, error: null }; }),
    from(table) {
      let patch, filters = [], one = false;
      const q = { select: () => q, order: () => q, limit: () => q, single() { one = true; return q; },
        eq(k, v) { filters.push([k, v]); return q; }, in(k, v) { filters.push([k, v]); return q; }, lte: () => q, lt: () => q,
        upsert(data) { calls.push({ table, insert: data }); return q; }, update(data) { patch = data; return q; },
        then(resolve) {
          calls.push({ table, patch, filters });
          const matches = filters.every(([k, v]) => Array.isArray(v) ? v.includes(row[k]) : row[k] === v);
          if (table === 'ad_library_brands') return Promise.resolve({ data: known }).then(resolve);
          if (patch && matches) Object.assign(row, patch);
          return Promise.resolve({ data: one ? row : matches ? [{ ...row }] : [], error: null }).then(resolve);
        } };
      return q;
    } };
  return { client, row, calls };
}
describe('durable company brand requests', () => {
  it('acknowledges persistence when Redis is down, without surfacing infrastructure errors', async () => {
    const f = fixture(), enqueue = vi.fn(async () => { throw Error('REDIS_DOWN secret'); });
    const result = await createBrandRequest('c1', 'u1', 'https://bonapet.net/', { client: f.client, enqueue });
    expect(result).toMatchObject({ saved: true, request: { status: 'pending', url: 'https://bonapet.net/' } });
    expect(f.calls[0].insert).toMatchObject({ company_id: 'c1', created_by: 'u1' });
    expect(enqueue).toHaveBeenCalledWith(id);
    expect(JSON.stringify(result)).not.toContain('secret');
  });
  it('rejects unsafe URLs before saving or scheduling', async () => {
    const f = fixture(), enqueue = vi.fn();
    await expect(createBrandRequest('c1', 'u1', 'https://localhost/', { client: f.client, enqueue })).rejects.toMatchObject({ status: 400 });
    expect(f.calls).toHaveLength(0); expect(enqueue).not.toHaveBeenCalled();
  });
  it('hides attempts, errors and other company identifiers from customers', () => {
    expect(publicBrandRequest(fixture({ last_error: 'META_RATE_LIMITED' }).row)).not.toHaveProperty('last_error');
    expect(publicBrandRequest(fixture().row)).not.toHaveProperty('company_id');
  });
  it('scopes listing and cancellation to the authorized company', async () => {
    const f = fixture();
    expect(await listBrandRequests('c2', { client: f.client })).toEqual([]);
    await expect(cancelBrandRequest('c2', id, { client: f.client })).rejects.toMatchObject({ status: 409 });
    expect(f.row.status).toBe('pending');
    await cancelBrandRequest('c1', id, { client: f.client }); expect(f.row.status).toBe('cancelled');
  });
  it('automatically follows one verified identity but never chooses between several', async () => {
    for (const count of [1, 2]) {
      const f = fixture(), complete = vi.fn();
      const candidates = Array.from({ length: count }, (_, i) => ({ pageId: String(12345 + i), name: 'Verified Page' }));
      await processBrandRequest(id, { client: f.client, complete, resolveIdentity: async () => ({ candidates }) });
      expect(f.row.status).toBe('needs_selection'); expect(f.row.candidates).toEqual(candidates);
      expect(complete).toHaveBeenCalledTimes(count === 1 ? 1 : 0);
    }
  });
  it('records source cooldown durably and propagates it to the worker', async () => {
    const f = fixture(), error = Object.assign(Error('META_RATE_LIMITED'), { retryAfterMs: 120000 }), started = Date.now();
    await expect(processBrandRequest(id, { client: f.client, resolveIdentity: async () => { throw error; } })).rejects.toBe(error);
    expect(f.row).toMatchObject({ status: 'pending', lease_token: null, last_error: 'META_RATE_LIMITED' });
    expect(Date.parse(f.row.next_attempt_at)).toBeGreaterThanOrEqual(started + 120000);
  });
  it('defers generic failures without storing raw URLs or credentials in errors', async () => {
    const f = fixture();
    expect(await processBrandRequest(id, { client: f.client, resolveIdentity: async () => { throw Error('socket https://user:secret@proxy'); } })).toEqual({ deferred: true });
    expect(f.row.last_error).toBe('BRAND_RESOLUTION_FAILED'); expect(f.row.status).toBe('pending');
  });
  it('cannot resurrect a request cancelled during resolution', async () => {
    const f = fixture(), complete = vi.fn();
    await processBrandRequest(id, { client: f.client, complete, resolveIdentity: async () => {
      f.row.status = 'cancelled'; f.row.lease_token = null;
      return { candidates: [{ pageId: '12345', name: 'A' }] };
    } });
    expect(f.row.status).toBe('cancelled'); expect(complete).not.toHaveBeenCalled();
  });
  it('does no external work without an acquired lease', async () => {
    const resolveIdentity = vi.fn();
    expect(await processBrandRequest(id, { client: { rpc: async () => ({ data: null }) }, resolveIdentity })).toEqual({ skipped: true });
    expect(resolveIdentity).not.toHaveBeenCalled();
  });
  it('redelivers persisted requests after a lost Redis queue', async () => {
    const f = fixture(), enqueue = vi.fn();
    expect(await scheduleBrandRequests(f.client, enqueue)).toBe(1); expect(enqueue).toHaveBeenCalledWith(id);
  });
  it('completes an exact cached page even during a future source cooldown', async () => {
    const f = fixture({ input_url: 'https://www.facebook.com/ads/library/?view_all_page_id=12345', next_attempt_at: '2099-01-01' },
      [{ name: 'Verified', meta_page_id: '12345' }]);
    const complete = vi.fn(async () => { f.row.status = 'ready'; f.row.brand_id = 'brand1'; });
    expect(await resolveKnownBrandRequest(f.row, { client: f.client, complete })).toMatchObject({ status: 'ready', brand_id: 'brand1' });
    expect(complete).toHaveBeenCalledWith('c1', id, '12345', { client: f.client });
    expect(f.calls.find(call => call.table === 'ad_library_brands').filters).toContainEqual(['country', 'ALL']);
  });
  it('does not guess identities from website names or placeholders', async () => {
    for (const [url, name] of [['https://bonapet.net/', 'Bonapet'], ['https://www.facebook.com/ads/library/?view_all_page_id=12345', 'Página 12345']]) {
      const f = fixture({ input_url: url }, [{ name, meta_page_id: '12345' }]), complete = vi.fn();
      await resolveKnownBrandRequest(f.row, { client: f.client, complete });
      expect(f.row.status).toBe('pending'); expect(complete).not.toHaveBeenCalled();
    }
  });
  it('cached resolution cannot take over cancelled or leased requests', async () => {
    for (const status of ['cancelled', 'resolving']) {
      const f = fixture({ status, input_url: 'https://www.facebook.com/ads/library/?view_all_page_id=12345' }, [{ name: 'Verified', meta_page_id: '12345' }]);
      const complete = vi.fn(); await resolveKnownBrandRequest(f.row, { client: f.client, complete });
      expect(f.calls).toHaveLength(0); expect(complete).not.toHaveBeenCalled();
    }
  });
  it('returns a concurrent cancellation instead of resurfacing a cached request', async () => {
    const f = fixture({ input_url: 'https://www.facebook.com/ads/library/?view_all_page_id=12345' }, [{ name: 'Verified', meta_page_id: '12345' }]);
    const complete = async () => { f.row.status = 'cancelled'; throw Object.assign(Error('cancelled'), { status: 409 }); };
    expect((await resolveKnownBrandRequest(f.row, { client: f.client, complete })).status).toBe('cancelled');
  });
  it('does not enqueue an external resolution after create found the cached identity', async () => {
    const f = fixture(), enqueue = vi.fn();
    const resolveKnown = vi.fn(async row => ({ ...row, status: 'ready', brand_id: 'brand1' }));
    const result = await createBrandRequest('c1', 'u1', 'https://bonapet.net/', { client: f.client, enqueue, resolveKnown });
    expect(result.request).toMatchObject({ status: 'ready', brandId: 'brand1' }); expect(enqueue).not.toHaveBeenCalled();
  });
  it('scheduler resolves catalogue matches outside the external queue', async () => {
    const f = fixture(), enqueue = vi.fn();
    const resolveKnown = vi.fn(async () => { f.row.status = 'ready'; return f.row; });
    await scheduleBrandRequests(f.client, enqueue, resolveKnown);
    expect(resolveKnown).toHaveBeenCalledTimes(1); expect(enqueue).not.toHaveBeenCalled();
  });
});
