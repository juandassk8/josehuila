import { describe, it, expect, vi } from 'vitest';
import { probeProxy, sanitizeProxyNetwork } from './proxyProbe.js';

describe('proxy network diagnostics', () => {
  it('keeps exit identity even when Meta rejects its separate tunnel', async () => {
    const probe = vi.fn(async (_proxy, options) => options?.network ? { ok: true, details: { exitIp: '8.8.8.8', country: 'United States' } }
      : { ok: false, code: 'denied', elapsedMs: 34 });
    const result = await probeProxy({ server: 'socks5://1.1.1.1:1080', username: 'private-user', password: 'private-secret' }, { probe });
    expect(result).toMatchObject({ ok: false, protocol: 'SOCKS5', authentication: 'username_password', network: { exitIp: '8.8.8.8' } });
    expect(JSON.stringify(result)).not.toMatch(/private-|1\.1\.1\.1/);
  });
  it('does not claim the configured server IP is the exit IP when the lookup fails', async () => {
    const result = await probeProxy({ server: 'http://1.1.1.1:8080' }, { probe: async (_p, options) => options?.network
      ? { ok: false, code: 'timeout' } : { ok: true, code: 'connected' } });
    expect(result).toMatchObject({ ok: true, authentication: 'none', network: null, networkStatus: 'unavailable', protocol: 'HTTP' });
  });
  it.each([{}, { success: false, ip: '8.8.8.8' }, { success: true, ip: '127.0.0.1' }, { success: true, ip: '10.0.0.1' }, { success: true, ip: 'not-an-ip' }])('rejects incomplete/private provider answers', input => {
    expect(() => sanitizeProxyNetwork(input)).toThrow('NETWORK_LOOKUP_INVALID');
  });
  it('whitelists and bounds metadata without preserving raw responses', () => {
    const result = sanitizeProxyNetwork({ success: true, ip: '8.8.8.8', country_code: 'US', city: 'a'.repeat(500), password: 'never-return',
      connection: { asn: 15169, isp: 'Google\n' }, timezone: { id: 'America/New_York' }, flag: { img: 'https://unexpected.test' } });
    expect(result.city).toHaveLength(160); expect(result.isp).toBe('Google'); expect(result.asn).toBe(15169);
    expect(result).not.toHaveProperty('flag'); expect(result).not.toHaveProperty('password');
  });
});
