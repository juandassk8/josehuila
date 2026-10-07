import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ authStatus: 0, rpc: vi.fn(), from: vi.fn(), enqueue: vi.fn(), read: vi.fn(), runtime: vi.fn(), proxyRead:vi.fn(), proxySave:vi.fn(), proxyPrepare:vi.fn(), probe:vi.fn(), reserve:vi.fn() }));
vi.mock('./_lib/auth.js', () => ({
  AuthError: class extends Error { constructor(status, message) { super(message); this.status = status; } },
  requireTeamAdmin: async () => { if (mock.authStatus) { const { AuthError } = await import('./_lib/auth.js'); throw new AuthError(mock.authStatus, 'No autorizado'); } return { id: '00000000-0000-0000-0000-000000000001' }; },
  serviceClient: () => ({ rpc: mock.rpc, from: mock.from }),
}));
vi.mock('./_lib/adminOperations/settings.js', async original => ({ ...await original(), readSettings: (...args) => mock.read(...args) }));
vi.mock('./_lib/adminOperations/runtime.js', async original => ({ ...await original(), readRuntime: (...args) => mock.runtime(...args) }));
vi.mock('./_lib/adLibrary/queue.js', () => ({ enqueueBrand: (...args) => mock.enqueue(...args), commandsRedis:()=>({set:mock.reserve}) }));
vi.mock('./_lib/adminOperations/proxies.js',()=>({readProxySettings:(...args)=>mock.proxyRead(...args),saveProxySettings:(...args)=>mock.proxySave(...args),prepareProxyTest:(...args)=>mock.proxyPrepare(...args)}));
vi.mock('./_lib/adminOperations/proxyProbe.js',()=>({probeProxy:(...args)=>mock.probe(...args)}));
import handler from './admin-operations.js';
import { DEFAULT_SETTINGS } from './_lib/adminOperations/settings.js';

const brandId = '00000000-0000-0000-0000-000000000011';
async function call(method, payload) {
  const res = { code: 200, setHeader: vi.fn(), status(n) { this.code = n; return this; }, json(body) { this.body = body; return this; } };
  await handler({ method, query: payload, body: payload }, res);
  return res;
}
function fakeTables({ follows = true, auditFails = false } = {}) {
  const updates = [], inserts = [];
  mock.from.mockImplementation(table => {
    let inserted;
    const q = { select: () => q, eq: () => q, limit: () => q, order: () => q,
      insert: row => { inserted = row; inserts.push(row); return q; }, update: row => { updates.push(row); return q; },
      single: async () => table === 'team_members' ? { data: { name: 'Admin' } }
        : inserted && auditFails ? { error: { message: 'private-error' } } : { data: { id: 1 } },
      then: resolve => Promise.resolve({ data: table === 'ad_library_follows' && follows ? [{ id: 1 }] : [] }).then(resolve) };
    return q;
  });
  return { updates, inserts };
}
beforeEach(() => {
  vi.clearAllMocks(); mock.authStatus = 0;
  mock.rpc.mockResolvedValue({ data: { rows: [], total: 0 } });
  mock.read.mockResolvedValue({ ...DEFAULT_SETTINGS, revision: 1 });
  mock.runtime.mockResolvedValue({ worker: null });
  mock.enqueue.mockResolvedValue({ id: 'job' }); fakeTables();
  mock.reserve.mockResolvedValue('OK');mock.proxyRead.mockResolvedValue({revision:0,routes:[]});mock.proxySave.mockResolvedValue({revision:1,routes:[]});
  mock.proxyPrepare.mockResolvedValue({server:'http://8.8.8.8:8000'});mock.probe.mockResolvedValue({ok:false,code:'denied'});
});

describe('global administration API', () => {
  it.each([401, 403])('blocks all reads and writes before data access (%s)', async status => {
    mock.authStatus = status;
    for (const action of ['overview', 'brands', 'runs', 'audit','proxies','scrapegraph']) expect((await call('GET', { action })).code).toBe(status);
    for (const action of ['save-settings', 'refresh-brand','save-proxies','test-proxy','save-scrapegraph','check-scrapegraph']) expect((await call('POST', { action })).code).toBe(status);
    expect(mock.proxyRead).not.toHaveBeenCalled();expect(mock.proxySave).not.toHaveBeenCalled();expect(mock.probe).not.toHaveBeenCalled();expect(mock.reserve).not.toHaveBeenCalled();
    expect(mock.rpc).not.toHaveBeenCalled(); expect(mock.from).not.toHaveBeenCalled(); expect(mock.runtime).not.toHaveBeenCalled(); expect(mock.enqueue).not.toHaveBeenCalled();
  });
  it('returns a no-store snapshot for admins', async () => {
    const res = await call('GET', { action: 'overview' });
    expect(res.code).toBe(200); expect(res.body.settings.revision).toBe(1);
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });
  it('saves using the authenticated admin and returns safe configuration',async()=>{
    const response=await call('POST',{action:'save-proxies',revision:0,routes:[],actor:'spoof'});
    expect(response.code).toBe(200);expect(mock.proxySave.mock.calls[0][1]).toBe('00000000-0000-0000-0000-000000000001');
  });
  it('throttles connection probes without saving or reporting a denial as success',async()=>{
    expect((await call('POST',{action:'test-proxy'})).body.result).toEqual({ok:false,code:'denied'});
    mock.reserve.mockResolvedValueOnce(null);expect((await call('POST',{action:'test-proxy'})).code).toBe(429);
    expect(mock.probe).toHaveBeenCalledTimes(1);expect(mock.proxySave).not.toHaveBeenCalled();
  });
  it('throttles ScrapeGraph checks across admins before reading a credential', async () => {
    mock.reserve.mockResolvedValueOnce(null);
    expect((await call('POST', { action: 'check-scrapegraph', revision: 0 })).code).toBe(429);
    expect(mock.from).not.toHaveBeenCalled();
    expect(mock.reserve).toHaveBeenCalledWith('adlib:admin:scrapegraph-check', '1', 'EX', 30, 'NX');
  });
  it.each([{ action: 'runs', brandId: 'bad' }, { action: 'runs', status: 'injected' },
    { action: 'brands', offset: -1 }, { action: 'brands', offset: 100001 }, { action: 'brands', search: 'x'.repeat(101) }])('validates filters %j', async input => {
    expect((await call('GET', input)).code).toBe(400); expect(mock.rpc).not.toHaveBeenCalled();
  });
  it('passes search as a parameter, never an interpolated query', async () => {
    await call('GET', { action: 'brands', search: "a'); drop table x;--", offset: 25, attention: 'true' });
    expect(mock.rpc).toHaveBeenCalledWith('admin_operations_brands', { p_search: "a'); drop table x;--", p_attention: true, p_offset: 25 });
  });
  it('rejects unknown settings and revisions', async () => {
    expect((await call('POST', { action: 'save-settings', revision: 1, settings: { ...DEFAULT_SETTINGS, token: 'secret' } })).code).toBe(400);
    expect((await call('POST', { action: 'save-settings', revision: '1', settings: DEFAULT_SETTINGS })).code).toBe(400);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it('uses server-authenticated actor and maps optimistic concurrency to 409', async () => {
    mock.rpc.mockResolvedValue({ error: { code: '40001', message: 'SETTINGS_CONFLICT' } });
    const res = await call('POST', { action: 'save-settings', revision: 2, actor: 'attacker', settings: DEFAULT_SETTINGS });
    expect(res.code).toBe(409);
    expect(mock.rpc).toHaveBeenCalledWith('admin_save_collection_settings', expect.objectContaining({ p_actor: '00000000-0000-0000-0000-000000000001', p_revision: 2 }));
  });
  it('rejects paused or unfollowed brands without enqueueing', async () => {
    mock.read.mockResolvedValueOnce({ ...DEFAULT_SETTINGS, enabled: false });
    expect((await call('POST', { action: 'refresh-brand', brandId })).code).toBe(409);
    fakeTables({ follows: false });
    expect((await call('POST', { action: 'refresh-brand', brandId })).code).toBe(409);
    expect(mock.enqueue).not.toHaveBeenCalled();
  });
  it('does not enqueue if the durable audit fails and does not expose database errors', async () => {
    fakeTables({ auditFails: true });
    const res = await call('POST', { action: 'refresh-brand', brandId });
    expect(res.code).toBe(503); expect(JSON.stringify(res.body)).not.toContain('private-error'); expect(mock.enqueue).not.toHaveBeenCalled();
  });
  it('records an admin request and delegates to the existing deduplicating queue', async () => {
    const { inserts, updates } = fakeTables();
    const res = await call('POST', { action: 'refresh-brand', brandId });
    expect(res.code).toBe(200); expect(inserts[0]).toMatchObject({ action: 'crawl_requested', brand_id: brandId, after_value: { status: 'requested' } });
    expect(mock.enqueue).toHaveBeenCalledWith(brandId, { reason: 'manual' }); expect(updates[0]).toEqual({ after_value: { status: 'queued' } });
  });
  it('records uncertain enqueue failures without reporting success or retrying', async () => {
    const { updates } = fakeTables(); mock.enqueue.mockRejectedValueOnce(new Error('sensitive url'));
    const res = await call('POST', { action: 'refresh-brand', brandId });
    expect(res.code).toBe(503); expect(res.body.error).not.toContain('sensitive');
    expect(updates[0]).toEqual({ after_value: { status: 'unconfirmed' } }); expect(mock.enqueue).toHaveBeenCalledTimes(1);
  });
});
