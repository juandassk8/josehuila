import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ team: true, manager: false, company: true,
  follows: [], access: vi.fn(), enqueue: vi.fn() }));

vi.mock('./_lib/auth.js', () => ({
  AuthError: class AuthError extends Error { constructor(status, message) { super(message); this.status = status; } },
  getUser: async () => ({ id: 'user-1' }),
  isTeamMember: async () => mocks.team,
  isTeamManager: async () => mocks.manager,
  requireCompanyAccess: async () => mocks.access(),
  serviceClient: () => ({ from: table => {
    const query = {
      select: () => query, eq: () => query, order: () => query, limit: () => query,
      maybeSingle: async () => ({ data: table === 'companies' && mocks.company ? { id: 'company-1' } : null, error: null }),
      then: resolve => Promise.resolve({ data: table === 'ad_library_follows' ? mocks.follows : [], error: null }).then(resolve),
    };
    return query;
  } }),
}));
vi.mock('./_lib/adLibrary/queue.js', () => ({ enqueueBrand: (...args) => mocks.enqueue(...args), sourceRetryAt: async () => null,
  crawlQueueStatus: async () => ({ available: true, workers: 1 }) }));

import handler from './ad-library.js';
import { AuthError } from './_lib/auth.js';

function response() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; } };
}

describe('ad library tenant boundary', () => {
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
});
