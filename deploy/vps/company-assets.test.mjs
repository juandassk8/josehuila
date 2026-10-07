import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assetPath, authorizeCompanyAsset, createCompanyAssetHandler } from './company-assets.mjs';
const file = 'company-a/12345678-1234-1234-1234-123456789abc.png';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6lY4AAAAASUVORK5CYII=', 'base64');
test('company paths exclude traversal, extra segments, and unsupported content', () => {
  assert.equal(assetPath(file).companyId, 'company-a');
  for (const value of ['../' + file, 'co/logo.svg', 'co/a/b.jpg', '/a.jpg', '%2e%2e/a.png']) assert.throws(() => assetPath(value));
});
test('authorization fails closed on other company, missing manager role and upstream error', async () => {
  const actor = { id: 'a' }, sign = () => 'internal-token';
  await assert.rejects(authorizeCompanyAsset('foreign', actor, false, { sign, transport: async () => Response.json([]) }), { status: 403 });
  await assert.rejects(authorizeCompanyAsset('a', actor, true, { sign, transport: async url => Response.json(url.includes('/rpc/') ? false : [{ id: 'a' }]) }), { status: 403 });
  await assert.rejects(authorizeCompanyAsset('a', actor, false, { sign, transport: async () => new Response('', { status: 500 }) }), { status: 503 });
  const calls = [];
  await authorizeCompanyAsset('a', actor, true, { sign, transport: async (url, options) => { calls.push({ url, options }); return Response.json(url.includes('/rpc/') ? true : [{ id: 'a' }]); } });
  assert.equal(calls.length, 2); assert.equal(JSON.parse(calls[1].options.body).p_id, 'a');
});
test('private images require session and company access; uploads are immutable and retry-safe', async t => {
  const filesRoot = await mkdtemp(join(tmpdir(), 'inforce-assets-'));
  t.after(() => rm(filesRoot, { recursive: true, force: true }));
  const records = new Map(), checked = [];
  const pool = { query: async (sql, args) => {
    if (sql.startsWith('select')) return { rows: records.has(args[1]) ? [records.get(args[1])] : [] };
    const [id, , name, owner_id, mime, size] = args; records.set(name, { id, owner_id, mime, size }); return { rowCount: 1 };
  } };
  const handler = createCompanyAssetHandler({ pool, filesRoot,
    userFor: async req => { if (req.headers.authorization !== 'Bearer valid') throw Object.assign(new Error('login'), { status: 401 }); return { user: { id: 'user' } }; },
    sessionFromCookie: async req => { if (req.headers.cookie !== 'valid') throw Object.assign(new Error('login'), { status: 401 }); return { id: 'user' }; },
    authorize: async (companyId, actor, write) => { checked.push({ companyId, actor, write }); if (companyId !== 'company-a') throw Object.assign(new Error('foreign'), { status: 403 }); },
    bodyBytes: async (req, limit) => { assert.equal(limit, 8388608); return req.body; },
  });
  const response = () => ({ headers: {}, setHeader(key, value) { this.headers[key] = value; }, json(body) { this.body = body; }, end(body) { this.body = body; } });
  await assert.rejects(handler({ method: 'GET', headers: {} }, response(), file, false), { status: 401 });
  await assert.rejects(handler({ method: 'GET', headers: { cookie: 'valid' } }, response(), file, true), { status: 404 });
  await assert.rejects(handler({ method: 'POST', headers: { cookie: 'valid' }, body: png }, response(), file, false), { status: 401 });
  await assert.rejects(handler({ method: 'POST', headers: { authorization: 'Bearer valid' }, body: Buffer.from('<svg/>') }, response(), file, false), { status: 415 });
  const request = { method: 'POST', headers: { authorization: 'Bearer valid' }, body: png };
  const uploaded = response(); await handler(request, uploaded, file, false);
  const retry = response(); await handler(request, retry, file, false); assert.deepEqual(retry.body, uploaded.body);
  const read = response(); await handler({ method: 'GET', headers: { cookie: 'valid' } }, read, file, false);
  assert.deepEqual(read.body, png); assert.equal(read.headers['Cache-Control'], 'private, no-store');
  await assert.rejects(handler({ method: 'GET', headers: { cookie: 'valid' } }, response(), file.replace('company-a', 'company-b'), false), { status: 403 });
  assert.equal(checked.filter(row => row.write).length, 3);
});
