import { createServer } from 'node:http';
import { readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const apiDirectory = fileURLToPath(new URL('../../api/', import.meta.url));

function adaptResponse(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => {
    if (!res.headersSent) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(body));
    return res;
  };
  res.send = (body) => {
    if (body !== null && typeof body === 'object' && !Buffer.isBuffer(body)) return res.json(body);
    res.end(body);
    return res;
  };
  return res;
}

function bodyLimit(config) {
  const value = config?.api?.bodyParser?.sizeLimit || '1mb';
  const match = String(value).match(/^(\d+)(kb|mb|b)?$/i);
  if (!match) throw new Error('Unsupported API body limit');
  return Number(match[1]) * ({ kb: 1024, mb: 1048576, b: 1 }[match[2]?.toLowerCase() || 'b']);
}

async function parseBody(req, limit) {
  if (Number(req.headers['content-length']) > limit) {
    throw Object.assign(new Error('Request body too large'), { status: 413 });
  }
  const chunks = [];
  let length = 0;
  // destroyOnReturn:false permite devolver 413 en vez de cerrar el socket al exceder el límite.
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    length += chunk.length;
    if (length > limit) throw Object.assign(new Error('Request body too large'), { status: 413 });
    chunks.push(chunk);
  }
  if (!length) return {};
  const raw = Buffer.concat(chunks).toString('utf8');
  const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (type === 'application/json') {
    try { return JSON.parse(raw); }
    catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
  }
  if (type === 'application/x-www-form-urlencoded') return Object.fromEntries(new URLSearchParams(raw));
  return raw;
}

export async function createApiServer({ directory = apiDirectory, backend = null } = {}) {
  // Solo endpoints de primer nivel. Nunca se expone _lib ni se importa una ruta del usuario.
  const endpoints = new Map();
  for (const name of await readdir(directory)) {
    if (!/^[a-z][a-z0-9-]*\.js$/.test(name)) continue;
    endpoints.set(`/api/${name.slice(0, -3)}`, pathToFileURL(resolve(directory, name)).href);
  }
  const server = createServer(async (req, rawRes) => {
    const res = adaptResponse(rawRes);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      const url = new URL(req.url, 'http://localhost');
      if (backend && await backend.handle(req, res)) return;
      if (url.pathname === '/healthz' && (req.method === 'GET' || req.method === 'HEAD')) {
        return res.json({ status: 'ok' });
      }
      const oauthMetadata = {
        '/.well-known/oauth-authorization-server': 'metadata',
        '/.well-known/oauth-protected-resource/api/creative-mcp': 'resource',
      }[url.pathname];
      const endpoint = endpoints.get(oauthMetadata ? '/api/creative-mcp-auth' : url.pathname.replace(/\/$/, ''));
      if (!endpoint) return res.status(404).json({ error: 'Not found' });
      const mod = await import(endpoint);
      if (typeof mod.default !== 'function') return res.status(404).json({ error: 'Not found' });
      req.query = Object.fromEntries(url.searchParams);
      if (oauthMetadata) req.query.action = oauthMetadata;
      // transcribe consume el stream multipart original: leerlo acá perdería el archivo.
      if (mod.config?.api?.bodyParser !== false) req.body = await parseBody(req, bodyLimit(mod.config));
      await mod.default(req, res);
      if (!res.writableEnded) res.end();
    } catch (error) {
      if (res.writableEnded) return;
      if (res.headersSent) { res.end(); return; }
      const status = error.status === 400 || error.status === 413 ? error.status : 500;
      if (status === 500) console.error('[api]', req.method, req.url?.split('?')[0], error.name);
      res.status(status).json({ error: status === 500 ? 'Internal server error' : error.message });
    }
  });
  server.requestTimeout = 360_000;
  server.headersTimeout = 60_000;
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { createBackend } = await import('./backend.mjs');
  const backend = createBackend();
  const server = await createApiServer({ backend });
  const port = Number(process.env.PORT || 3001);
  server.listen(port, '127.0.0.1', () => console.log(`Inforce API listening on 127.0.0.1:${port}`));
  const shutdown = () => {
    backend.close().finally(() => server.close(() => process.exit(0)));
    setTimeout(() => process.exit(1), 30_000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
