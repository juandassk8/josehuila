import { describe, it, expect, vi } from 'vitest';
import { authorizationInput, challenge, registerClient, requireScope, scopes, authenticate, exchange } from './oauth.js';
const cfg = { issuer: 'https://inforce.example', resource: 'https://inforce.example/api/creative-mcp', redirects: ['https://chatgpt.com/connector_platform_oauth_redirect'] };
const input = { client_id: 'client', response_type: 'code', redirect_uri: cfg.redirects[0], resource: cfg.resource,
  state: 'session-bound-state', code_challenge: challenge('a'.repeat(43)), code_challenge_method: 'S256', scope: 'creatives:read creatives:write' };
describe('company MCP authorization', () => {
  it('accepts PKCE S256 with exact resource and redirect', () => { expect(authorizationInput(input, cfg)).toEqual(input); });
  it.each([
    { redirect_uri: 'https://chatgpt.com.evil.example/connector_platform_oauth_redirect' },
    { resource: 'https://another.example' }, { code_challenge_method: 'plain' }, { code_challenge: 'short' },
    { scope: 'admin' }, { scope: 'creatives:write' }, { state: '' },
  ])('rejects modified OAuth input %j', bad => expect(() => authorizationInput({ ...input, ...bad }, cfg)).toThrow());
  it('cannot register a non-allowlisted callback', async () => {
    const db = { query: vi.fn() };
    await expect(registerClient(db, { redirect_uris: ['http://127.0.0.1/callback'] }, cfg)).rejects.toThrow();
    expect(db.query).not.toHaveBeenCalled();
  });
  it('read-only tokens cannot save', () => {
    expect(() => requireScope({ scope: scopes('creatives:read') }, 'creatives:write')).toThrow('insufficient_scope');
  });
  it('does not accept the regular Inforce JWT as an MCP token', async () => {
    const db = { query: vi.fn() };
    await expect(authenticate(db, { headers: { authorization: 'Bearer header.payload.signature' } }, cfg)).rejects.toMatchObject({ status: 401 });
    expect(db.query).not.toHaveBeenCalled();
  });
  it('rejects a removed company membership on every request', async () => {
    const db = { query: vi.fn().mockResolvedValueOnce({ rows: [{ user_id: 'user', company_id: 'company' }] }).mockResolvedValueOnce({ rows: [{ allowed: false }] }) };
    await expect(authenticate(db, { headers: { authorization: `Bearer ${'a'.repeat(43)}` } }, cfg)).rejects.toMatchObject({ status: 403 });
  });
  it('rolls back consumed codes when the grant is invalid', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() };
    await expect(exchange({ connect: async () => db }, { ...input, grant_type: 'authorization_code', code: 'code', code_verifier: 'a'.repeat(43) }, cfg)).rejects.toThrow('invalid_grant');
    expect(db.query).toHaveBeenCalledWith('rollback'); expect(db.release).toHaveBeenCalled();
    expect(db.query.mock.calls.some(([sql]) => sql === 'commit')).toBe(false);
  });
});
