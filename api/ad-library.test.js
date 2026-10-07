import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ team: true, manager: false, company: true, edges: [], rpcCalls: [],
  follows: [], brands: [], enabled: true, access: vi.fn(), enqueue: vi.fn() }));

vi.mock('./_lib/auth.js', () => ({
  AuthError: class AuthError extends Error { constructor(status, message) { super(message); this.status = status; } },
  getUser: async () => ({ id: 'user-1' }),
  isTeamMember: async () => mocks.team,
  isTeamManager: async () => mocks.manager,
  requireCompanyAccess: async () => mocks.access(),
  serviceClient: () => ({ rpc: async (name, args) => { mocks.rpcCalls.push({name,args}); return { data: name === 'ad_library_brand_network' ? {edges:mocks.edges,truncated:false} : [], error:null }; }, from: table => {
    const query = {
      select: () => query, eq: () => query, in: () => query, order: () => query, limit: () => query,
      maybeSingle: async () => ({ data: table === 'companies' && mocks.company ? { id: 'company-1' } : null, error: null }),
      then: resolve => Promise.resolve({ data: table === 'ad_library_follows' ? mocks.follows : table === 'ad_library_brands' ? mocks.brands : [], error: null }).then(resolve),
    };
    return query;
  } }),
}));
vi.mock('./_lib/adLibrary/queue.js', () => ({ enqueueBrand: (...args) => mocks.enqueue(...args), sourceRetryAt: async () => null,
  crawlQueueStatus: async () => ({ available: true, workers: 1 }) }));
vi.mock('./_lib/adminOperations/settings.js', () => ({ readSettings: async () => ({ enabled: mocks.enabled }) }));

import handler from './ad-library.js';
import { AuthError } from './_lib/auth.js';

function response() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; } };
}

describe('ad library tenant boundary', () => {
  it('shows the canonical fanpage name across company aliases', async () => {
    mocks.team = true; mocks.manager = true; mocks.follows = [{ brand_id: 'brand-1', alias: 'Personal name' }];
    mocks.brands = [{ id: 'brand-1', name: 'Canonical fanpage' }];
    const res = response(); await handler({ method: 'GET', query: { action: 'brands', companyId: 'company-1' } }, res);
    expect(res.body.brands[0].display_name).toBe('Canonical fanpage');
    mocks.follows = []; mocks.brands = []; mocks.manager = false;
  });
  it('never exposes signals of an unfollowed brand', async () => {
    mocks.team = true; mocks.follows = [];
    const res = response(); await handler({ method: 'GET', query: { action: 'signals', companyId: 'company-1', brandId: 'other' } }, res);
    expect(res.statusCode).toBe(403);
  });
  it('requires management permission before starting a URL lookup', async () => {
    mocks.team = true; mocks.manager = false;
    const res = response(); await handler({ method: 'POST', body: { action: 'resolve-brand', companyId: 'company-1', url: 'https://shop.example' } }, res);
    expect(res.statusCode).toBe(403);
  });
  it('shows an administrative pause in a followed brand without exposing global settings', async () => {
    mocks.team = true; mocks.manager = true; mocks.enabled = false;
    mocks.follows = [{ brand_id: 'brand-1' }]; mocks.brands = [{ id: 'brand-1', name: 'Marca' }];
    const res = response();
    await handler({ method: 'GET', query: { action: 'collection', companyId: 'company-1', brandId: 'brand-1' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ phase: 'paused', retryAt: null });
    expect(res.body).not.toHaveProperty('settings');
    mocks.enabled = true; mocks.follows = []; mocks.brands = []; mocks.manager = false;
  });
  it('does not expose another company brand collection status', async () => {
    mocks.team = true; mocks.follows = [];
    const res = response();
    await handler({ method: 'GET', query: { action: 'collection', companyId: 'company-1', brandId: 'other-brand' } }, res);
    expect(res.statusCode).toBe(403);
  });
  it('rejects a brand that the company does not follow before querying ads', async () => {
    mocks.team = true; mocks.follows = [];
    const res = response();
    await handler({ method: 'GET', query: { action: 'ads', companyId: 'company-1', brandId: 'other-brand' } }, res);
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/no seguida/i);
  });

  it('does not let a read-only team member change follows', async () => {
    mocks.team = true; mocks.manager = false;
    const res = response();
    await handler({ method: 'POST', body: { action: 'follow', companyId: 'company-1', pageId: '646751588512715' } }, res);
    expect(res.statusCode).toBe(403);
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
  it('requires company assignment for a read-only team member', async () => {
    mocks.team = true; mocks.manager = false;
    mocks.access.mockRejectedValueOnce(new AuthError(403, 'forbidden'));
    const res = response();
    await handler({ method: 'GET', query: { action: 'brands', companyId: 'unassigned-company' } }, res);
    expect(res.statusCode).toBe(403);
  });
  it('resolves family membership on the server and sends only scoped page IDs to pagination', async () => {
    const a='10000000-0000-4000-8000-000000000001', b='20000000-0000-4000-8000-000000000002';
    mocks.team=true; mocks.manager=true; mocks.follows=[{brand_id:a},{brand_id:b}];
    mocks.brands=[{id:a,name:'A'},{id:b,name:'B'}]; mocks.edges=[a,b].map(brandId=>({brandId,domain:'shop.example',adCount:1})); mocks.rpcCalls=[];
    const res=response(); await handler({method:'GET',query:{action:'ads',companyId:'company-1',familyId:a,brandIds:['untrusted']}},res);
    expect(res.statusCode).toBe(200);
    expect(mocks.rpcCalls.find(call=>call.name==='ad_library_workspace_scope_page').args).toMatchObject({p_company:'company-1',p_brands:[a,b]});
    mocks.follows=[]; mocks.brands=[]; mocks.edges=[]; mocks.manager=false;
  });
  it('rejects another company family anchor and never queries its ads', async () => {
    mocks.team=true; mocks.manager=true; mocks.follows=[]; mocks.brands=[]; mocks.rpcCalls=[];
    const res=response(); await handler({method:'GET',query:{action:'ads',companyId:'company-1',familyId:'30000000-0000-4000-8000-000000000003'}},res);
    expect(res.statusCode).toBe(403);
    expect(mocks.rpcCalls.some(call=>call.name==='ad_library_workspace_scope_page')).toBe(false); mocks.manager=false;
  });
});
