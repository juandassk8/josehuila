import { describe, it, expect, vi } from 'vitest';
import { createDataClient } from './postgres-client.js';
describe('native data client', () => {
  it('invokes browser fetch with the global receiver', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = function () { expect(this).toBe(globalThis); return Promise.resolve(new Response('[]')); };
    try { expect((await createDataClient('/backend').from('tasks').select()).error).toBeNull(); }
    finally { globalThis.fetch = original; vi.restoreAllMocks(); }
  });
  it('preserves joins, filters, counts and bearer headers', async () => {
    let request;
    const client = createDataClient('/backend', { headers: async () => ({ Authorization: 'Bearer test' }), fetch: async (url, options) => {
      request = { url: new URL(url, 'http://local'), options };
      return new Response('[{"id":1}]', { headers: { 'content-range': '0-0/12' } });
    } });
    const result = await client.from('tasks').select('id,owner:team_members(name)', { count: 'exact' }).in('name', ['a,b', 'quote"']).eq('active', true).order('created_at', { ascending: false }).range(0, 9);
    expect(result.count).toBe(12);
    expect(request.url.searchParams.get('select')).toBe('id,owner:team_members(name)');
    expect(request.url.searchParams.get('name')).toBe('in.("a,b","quote\\\"")');
    expect(request.url.searchParams.get('limit')).toBe('10');
    expect(request.options.headers.Authorization).toBe('Bearer test');
  });
  it('keeps missing defaults on upsert and returns inserted rows', async () => {
    let options;
    const client = createDataClient('/backend', { fetch: async (_, o) => { options = o; return new Response('[{"id":2}]'); } });
    expect((await client.from('tasks').upsert({ id: 2 }, { onConflict: 'id' }).select().single()).data).toEqual({ id: 2 });
    expect(options.headers.Prefer).toContain('missing=default');
    expect(options.headers.Prefer).toContain('return=representation');
  });
  it('distinguishes missing optional row, required row and server error', async () => {
    const client = createDataClient('/backend', { fetch: async () => new Response('[]') });
    expect((await client.from('tasks').maybeSingle()).error).toBeNull();
    expect((await client.from('tasks').single()).error.code).toBe('PGRST116');
    const denied = createDataClient('/backend', { fetch: async () => new Response('{"code":"42501"}', { status: 403 }) });
    expect((await denied.from('tasks').select()).error.code).toBe('42501');
  });
});
