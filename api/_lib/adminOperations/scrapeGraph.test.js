import { describe, expect, it, vi } from 'vitest';
import { encryptScrapeGraphKey, readScrapeGraphSettings, saveScrapeGraphSettings, checkScrapeGraphSettings, loadScrapeGraphKey } from './scrapeGraph.js';
import { encryptProxies } from './proxies.js';

const env = { ADLIB_PROXY_ENCRYPTION_KEY: 'ba'.repeat(32) };
const secret = 'test-private-sgai-key';
function fixture(configured = true) {
  const row = { revision: 1, encrypted_value: configured ? encryptScrapeGraphKey(secret, env) : null,
    checked_at: null, check_status: null, remaining: null, used: null, updated_at: null };
  const q = { select: () => q, eq: () => q, single: async () => ({ data: { ...row } }) };
  const client = { from: vi.fn(() => q), rpc: vi.fn(async (name, input) => {
    if (input.p_revision !== row.revision) return { error: { code: '40001' } };
    if (name === 'admin_save_scrapegraph') Object.assign(row, { encrypted_value: input.p_encrypted, revision: row.revision + 1, checked_at: null });
    else Object.assign(row, { checked_at: '2026-10-06T20:00:00Z', check_status: input.p_status, remaining: input.p_remaining, used: input.p_used });
    return { data: { revision: row.revision } };
  }) };
  return { row, client, options: { client, env } };
}
describe('ScrapeGraphAI administration', () => {
  it('exposes only metadata and keeps the automatic collector disabled', async () => {
    const { client, row } = fixture();
    const result = await readScrapeGraphSettings(client, env);
    expect(result).toMatchObject({ configured: true, automaticEnabled: false, writable: true });
    expect(JSON.stringify(result)).not.toContain(secret); expect(JSON.stringify(result)).not.toContain(row.encrypted_value);
    expect(await loadScrapeGraphKey(client, env)).toBe(secret);
  });
  it('encrypts with a unique IV and rejects tampering, wrong keys and proxy ciphertext', async () => {
    const { client, row } = fixture();
    expect(encryptScrapeGraphKey(secret, env)).not.toBe(row.encrypted_value);
    expect(row.encrypted_value).not.toContain(secret);
    await expect(loadScrapeGraphKey(client, { ADLIB_PROXY_ENCRYPTION_KEY: 'bb'.repeat(32) })).rejects.toThrow('SGAI_CONFIGURATION_UNAVAILABLE');
    row.encrypted_value = row.encrypted_value.slice(0, -4) + 'AAAA';
    await expect(loadScrapeGraphKey(client, env)).rejects.toThrow('SGAI_CONFIGURATION_UNAVAILABLE');
    row.encrypted_value = encryptProxies([{ server: 'http://1.1.1.1:80' }], env);
    await expect(loadScrapeGraphKey(client, env)).rejects.toThrow('SGAI_CONFIGURATION_UNAVAILABLE');
  });
  it('saves encrypted values, clears the old validation and supports removal', async () => {
    const { client, row, options } = fixture(); row.checked_at = 'old';
    const result = await saveScrapeGraphSettings({ revision: 1, mode: 'replace', apiKey: ' new-key ' }, 'actor', options);
    expect(result).toMatchObject({ revision: 2, configured: true, check: null });
    expect(JSON.stringify(client.rpc.mock.calls)).not.toContain('new-key');
    expect(await loadScrapeGraphKey(client, env)).toBe('new-key');
    expect((await saveScrapeGraphSettings({ revision: 2, mode: 'remove' }, 'actor', options)).configured).toBe(false);
    await expect(loadScrapeGraphKey(client, env)).rejects.toThrow('SGAI_KEY_MISSING');
  });
  it.each(['', 'a b', 'a\nb', 'x'.repeat(513), 123])('rejects invalid keys without a write: %j', async apiKey => {
    const { client, options } = fixture();
    await expect(saveScrapeGraphSettings({ revision: 1, mode: 'replace', apiKey }, 'actor', options)).rejects.toMatchObject({ status: 400 });
    expect(client.rpc).not.toHaveBeenCalled();
  });
  it('checks only credits, persists the balance, and never exposes the key', async () => {
    const { options } = fixture(); const credits = vi.fn(async () => ({ remaining: 100, used: 3 }));
    class Pilot { constructor(input) { expect(input.apiKey).toBe(secret); } credits = credits; run = () => { throw Error('Paid extraction forbidden'); }; }
    const result = await checkScrapeGraphSettings({ revision: 1 }, 'actor', { ...options, Pilot });
    expect(credits).toHaveBeenCalledOnce(); expect(result.check).toMatchObject({ status: 'connected', remaining: 100, used: 3 });
    expect(JSON.stringify(result)).not.toContain(secret);
  });
  it.each(['SGAI_AUTH_FAILED', 'SGAI_RATE_LIMITED', 'private upstream response including key'])('sanitizes provider failures: %s', async code => {
    const { options } = fixture();
    class Pilot { credits = async () => { throw Error(code); }; }
    const result = await checkScrapeGraphSettings({ revision: 1 }, 'actor', { ...options, Pilot });
    expect(result.check.status).toBe(code.startsWith('SGAI_') ? code : 'SGAI_SERVICE_FAILED');
    expect(result.check.remaining).toBeNull(); expect(JSON.stringify(result)).not.toContain('private upstream');
  });
  it('rejects obsolete revisions both before the call and if the key changes during checking', async () => {
    const { row, options } = fixture(); let called = 0;
    class Pilot { credits = async () => { called++; row.revision++; return { remaining: 100, used: 3 }; }; }
    await expect(checkScrapeGraphSettings({ revision: 0 }, 'actor', { ...options, Pilot })).rejects.toMatchObject({ status: 409 });
    expect(called).toBe(0);
    await expect(checkScrapeGraphSettings({ revision: 1 }, 'actor', { ...options, Pilot })).rejects.toMatchObject({ status: 409 });
    expect(row.checked_at).toBeNull();
  });
  it('fails closed when missing the key or server encryption configuration', async () => {
    const { client, options } = fixture(false);
    expect((await readScrapeGraphSettings(client, {})).writable).toBe(false);
    await expect(checkScrapeGraphSettings({ revision: 1 }, 'actor', options)).rejects.toMatchObject({ status: 400 });
    await expect(saveScrapeGraphSettings({ revision: 1, mode: 'replace', apiKey: secret }, 'actor', { client, env: {} })).rejects.toThrow('SGAI_ENCRYPTION_UNAVAILABLE');
    expect(client.rpc).not.toHaveBeenCalled();
  });
});
