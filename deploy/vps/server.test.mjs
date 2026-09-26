import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createApiServer } from './server.mjs';

let directory, server, origin;
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'inforce-api-test-'));
  await writeFile(join(directory, 'package.json'), '{"type":"module"}');
  await writeFile(join(directory, 'echo.js'), `
    export const config = { api: { bodyParser: { sizeLimit: '1kb' } } };
    export default (req, res) => res.status(201).json({ body: req.body, query: req.query, auth: req.headers.authorization });
  `);
  await writeFile(join(directory, 'upload.js'), `
    export const config = { api: { bodyParser: false } };
    export default async (req, res) => { const chunks = []; for await (const c of req) chunks.push(c); res.send(Buffer.concat(chunks)); };
  `);
  await writeFile(join(directory, 'stream.js'), `
    export default async (req, res) => { res.setHeader('Content-Type','text/event-stream'); res.write('data: first\\n\\n'); await new Promise(r => setTimeout(r, 10)); res.end('data: last\\n\\n'); };
  `);
  server = await createApiServer({ directory });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  origin = 'http://127.0.0.1:' + server.address().port;
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (directory) await rm(directory, { recursive: true, force: true });
});

test('adapta JSON, query, status y autorización', async () => {
  const res = await fetch(origin + '/api/echo?action=read', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer example' }, body: '{"value":42}' });
  assert.equal(res.status, 201);
  assert.deepEqual(await res.json(), { body: { value: 42 }, query: { action: 'read' }, auth: 'Bearer example' });
});
test('rechaza JSON inválido', async () => {
  const res = await fetch(origin + '/api/echo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(res.status, 400);
});
test('respeta el límite de tamaño del endpoint', async () => {
  const res = await fetch(origin + '/api/echo', { method: 'POST', body: 'x'.repeat(2048) });
  assert.equal(res.status, 413);
});
test('preserva bytes multipart para transcripción', async () => {
  const body = Buffer.from([0, 255, 13, 10, 128, 1]);
  const res = await fetch(origin + '/api/upload', { method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=test' }, body });
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), body);
});
test('conserva el streaming SSE', async () => {
  const res = await fetch(origin + '/api/stream');
  assert.equal(res.headers.get('content-type'), 'text/event-stream');
  assert.equal(await res.text(), 'data: first\n\ndata: last\n\n');
});
test('no expone archivos privados ni endpoints inexistentes', async () => {
  for (const path of ['/api/_lib/auth', '/api/unknown', '/.env', '/api/%2e%2e/package']) {
    assert.equal((await fetch(origin + path)).status, 404);
  }
  assert.deepEqual(await (await fetch(origin + '/healthz')).json(), { status: 'ok' });
});
