import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApiServer } from '../../../deploy/vps/server.mjs';

const { query } = vi.hoisted(() => ({ query: vi.fn(() => { throw new Error('Discovery must not query PostgreSQL'); }) }));
vi.mock('./db.js', async importOriginal => ({ ...await importOriginal(), creativeDb: () => ({ query }) }));

let server, origin;
const issuer = 'https://inforce.example';
beforeAll(async () => {
  vi.stubEnv('CREATIVE_MCP_ENABLED', '1');
  vi.stubEnv('PUBLIC_BASE_URL', issuer);
  server = await createApiServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => {
  server?.closeAllConnections();
  if (server) await new Promise(resolve => server.close(resolve));
  vi.unstubAllEnvs();
});

describe('OAuth discovery through the real VPS router', () => {
  it.each(['GET', 'HEAD', 'POST'])('advertises discovery to an unauthenticated %s probe', async method => {
    const response = await fetch(`${origin}/api/creative-mcp`, { method });
    expect(response.status).toBe(401);
    const challenge = response.headers.get('www-authenticate');
    expect(challenge).toContain(`resource_metadata="${issuer}/.well-known/oauth-protected-resource/api/creative-mcp"`);
    expect(challenge).toContain('scope="creatives:read creatives:write"');
    expect(query).not.toHaveBeenCalled();
    if (method === 'HEAD') expect(await response.text()).toBe('');
  });

  it.each(['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/api/creative-mcp'])('discovers issuer and PKCE from %s without a session or database query', async path => {
    const response = await fetch(origin + path);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const resource = await response.json();
    expect(resource.resource).toBe(`${issuer}/api/creative-mcp`);
    expect(resource.authorization_servers).toEqual([issuer]);
    const metadataResponse = await fetch(`${origin}/.well-known/oauth-authorization-server`);
    expect(metadataResponse.status).toBe(200);
    const metadata = await metadataResponse.json();
    expect(metadata.issuer).toBe(resource.authorization_servers[0]);
    expect(metadata.code_challenge_methods_supported).toContain('S256');
    expect(metadata.token_endpoint_auth_methods_supported).toContain('none');
    expect(new URL(metadata.registration_endpoint).origin).toBe(issuer);
    expect(query).not.toHaveBeenCalled();
  });

  it('does not let a query parameter turn public discovery into another action', async () => {
    const response = await fetch(`${origin}/.well-known/oauth-protected-resource?action=approve`);
    expect(response.status).toBe(200);
    expect((await response.json()).resource).toBe(`${issuer}/api/creative-mcp`);
    expect(query).not.toHaveBeenCalled();
  });

  it('still rejects a browser origin outside the allowlist', async () => {
    const response = await fetch(`${origin}/api/creative-mcp`, { headers: { Origin: 'https://untrusted.example' } });
    expect(response.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });
});
