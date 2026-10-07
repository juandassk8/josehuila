import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { digest, randomToken, equal, signToken, verifyToken, hashPassword, checkPassword } from './security.mjs';
import { createCompanyAssetHandler, authorizeCompanyAsset } from './company-assets.mjs';

const { Pool } = pg;
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const normalizeEmail = email => String(email || '').trim().toLowerCase();
const validEmail = email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function bodyBytes(req, limit = 1048576) {
  if (Number(req.headers['content-length']) > limit) fail(413, 'Archivo demasiado grande');
  const chunks = []; let size = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > limit) fail(413, 'Archivo demasiado grande');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function jsonBody(req) {
  try { return JSON.parse((await bodyBytes(req)).toString() || '{}'); }
  catch (e) { if (e.status) throw e; fail(400, 'JSON inválido'); }
}
function publicUser(user) {
  return { id: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', created_at: user.created_at, email_confirmed_at: user.email_confirmed_at, user_metadata: user.raw_user_meta_data || {}, app_metadata: { provider: 'email', providers: ['email'] } };
}

export function createBackend() {
  const pool = new Pool({ host: process.env.PGHOST || '/var/run/postgresql', database: process.env.PGDATABASE || 'inforce', user: process.env.PGUSER || 'inforce', max: 10 });
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32 || !process.env.BACKEND_SERVICE_KEY) throw new Error('Backend secrets not configured');
  const base = process.env.PUBLIC_BASE_URL;
  const filesRoot = process.env.UPLOADS_DIR || '/var/lib/inforce/uploads';
  const secureCookie = String(base).startsWith('https:') ? '; Secure' : '';
  const service = req => equal(req.headers.authorization?.replace(/^Bearer\s+/i, ''), process.env.BACKEND_SERVICE_KEY);
  const refreshCookie = req => String(req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('inforce_refresh='))?.slice(16);
  const cookie = (res, token, maxAge = 2592000) => res.setHeader('Set-Cookie', `inforce_refresh=${token}; Path=/backend; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureCookie}`);
  const limits = new Map();
  function throttle(req, suffix = '') {
    const ip = req.headers['x-real-ip'] || req.socket.remoteAddress;
    const key = `${ip}:${suffix}`;
    const now = Date.now();
    let record = limits.get(key);
    if (!record || record.until < now) { record = { count: 0, until: now + 60000 }; limits.set(key, record); }
    if (++record.count > 15) fail(429, 'Demasiados intentos. Espera un minuto.');
    if (limits.size > 10000) for (const [k, r] of limits) if (r.until < now) limits.delete(k);
  }
  async function userFor(req) {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    const claims = verifyToken(token, secret);
    if (!claims || claims.role !== 'authenticated' || !UUID.test(claims.sub || '') || !UUID.test(claims.sid || '')) fail(401, 'Sesión inválida o vencida');
    const { rows } = await pool.query("select u.* from auth.users u join auth.sessions s on s.user_id=u.id where u.id=$1 and u.token_version=$2 and s.id=$3 and s.expires_at>now() and s.revoked_at is null and not u.disabled and not app_private.inactive_team_member(u.id)", [claims.sub, claims.ver, claims.sid]);
    if (!rows[0]) fail(401, 'Sesión inválida o vencida');
    return { user: rows[0], claims, token };
  }
  async function sessionFromCookie(req) {
    const token = refreshCookie(req);
    if (!token) fail(401, 'Vuelve a iniciar sesión');
    const { rows } = await pool.query("select u.*, s.id as session_id from auth.sessions s join auth.users u on u.id=s.user_id where s.token_hash=$1 and s.expires_at>now() and s.revoked_at is null and not u.disabled and not app_private.inactive_team_member(u.id)", [digest(token)]);
    if (!rows[0]) fail(401, 'Vuelve a iniciar sesión');
    return rows[0];
  }
  function sessionPayload(user, sid) {
    return { access_token: signToken({ sub: user.id, email: user.email, role: 'authenticated', ver: user.token_version, sid }, secret), token_type: 'bearer', expires_in: 900, expires_at: Math.floor(Date.now() / 1000) + 900, user: publicUser(user) };
  }
  async function newSession(user, res) {
    const token = randomToken(), sid = randomUUID();
    await pool.query('insert into auth.sessions(id,user_id,token_hash,expires_at) values($1,$2,$3,now()+interval \'30 days\')', [sid, user.id, digest(token)]);
    cookie(res, token);
    return sessionPayload(user, sid);
  }
  async function createUser(values) {
    const email = normalizeEmail(values.email);
    if (!validEmail(email)) fail(400, 'Correo inválido');
    const encrypted = await hashPassword(values.password);
    try {
      const { rows } = await pool.query('insert into auth.users(email,encrypted_password,raw_user_meta_data,email_confirmed_at) values($1,$2,$3,now()) returning *', [email, encrypted, values.user_metadata || {}]);
      return rows[0];
    } catch (error) { if (error.code === '23505') fail(409, 'El correo ya está registrado'); throw error; }
  }
  async function updateUser(id, values) {
    if (!UUID.test(id)) fail(400, 'Usuario inválido');
    const fields = [], args = [];
    if (values.password !== undefined) { args.push(await hashPassword(values.password)); fields.push(`encrypted_password=$${args.length}`); }
    if (values.email !== undefined) { const email = normalizeEmail(values.email); if (!validEmail(email)) fail(400, 'Correo inválido'); args.push(email); fields.push(`email=$${args.length}`); }
    if (!fields.length) fail(400, 'No hay cambios');
    args.push(id);
    const { rows } = await pool.query(`update auth.users set ${fields.join(',')}, token_version=token_version+1,updated_at=now() where id=$${args.length} returning *`, args);
    if (!rows[0]) fail(404, 'Usuario no encontrado');
    await pool.query('update auth.sessions set revoked_at=now() where user_id=$1', [id]);
    return rows[0];
  }
  async function auth(req, res, url) {
    const path = url.pathname.replace('/backend/auth/v1/', '');
    if (path.startsWith('admin/')) {
      if (!service(req)) fail(403, 'Acceso reservado al servidor');
      const id = path.split('/')[2];
      if (id && !UUID.test(id)) fail(400, 'Usuario inválido');
      if (req.method === 'GET' && !id) {
        const page = Math.max(1, Number(url.searchParams.get('page')) || 1), limit = Math.min(200, Math.max(1, Number(url.searchParams.get('per_page')) || 50));
        const { rows } = await pool.query('select * from auth.users order by created_at limit $1 offset $2', [limit, (page - 1) * limit]);
        return res.json({ users: rows.map(publicUser) });
      }
      if (req.method === 'POST' && !id) return res.json({ user: publicUser(await createUser(await jsonBody(req))) });
      if (req.method === 'PUT' && id) return res.json({ user: publicUser(await updateUser(id, await jsonBody(req))) });
      if (req.method === 'DELETE' && id) { await pool.query('delete from auth.users where id=$1', [id]); return res.json({}); }
      if (req.method === 'GET' && id) { const { rows } = await pool.query('select * from auth.users where id=$1', [id]); if (!rows[0]) fail(404, 'Usuario no encontrado'); return res.json({ user: publicUser(rows[0]) }); }
      fail(405, 'Método no permitido');
    }
    if (req.method === 'POST') {
      // Los cookies de renovación no autorizan operaciones desde otro origen.
      if (req.headers.origin && req.headers.origin !== base) fail(403, 'Origen no autorizado');
      if (path === 'token' && url.searchParams.get('grant_type') === 'password') {
        const values = await jsonBody(req); throttle(req, 'login');
        const { rows } = await pool.query("select u.* from auth.users u where u.email=$1 and not app_private.inactive_team_member(u.id)", [normalizeEmail(values.email)]);
        const user = rows[0];
        const valid = await checkPassword(values.password, user?.encrypted_password || dummyPassword);
        if (!user || !valid || user.disabled) fail(401, 'Correo o contraseña incorrectos');
        return res.json(await newSession(user, res));
      }
      if (path === 'token' && url.searchParams.get('grant_type') === 'refresh_token') {
        const user = await sessionFromCookie(req);
        return res.json(sessionPayload(user, user.session_id));
      }
      if (path === 'logout') {
        const token = refreshCookie(req);
        if (token) await pool.query('update auth.sessions set revoked_at=now() where token_hash=$1', [digest(token)]);
        cookie(res, '', 0); return res.json({});
      }
      if (path === 'signup') {
        if (process.env.ALLOW_SIGNUP !== 'true') fail(403, 'Solicita una cuenta al administrador de esta instalación');
        throttle(req, 'signup');
        return res.json(await newSession(await createUser(await jsonBody(req)), res));
      }
      if (path === 'recover') fail(503, 'El correo de recuperación no está configurado. Solicita una nueva contraseña al administrador.');
      if (path === 'user') {
        const { user } = await userFor(req);
        const values = await jsonBody(req);
        // Cambiar email requiere un flujo de verificación; no se acepta desde un perfil.
        if (values.email) fail(400, 'El cambio de correo requiere al administrador');
        const updated = await updateUser(user.id, { password: values.password });
        cookie(res, '', 0);
        return res.json(publicUser(updated));
      }
    }
    if (path === 'user' && req.method === 'GET') return res.json(publicUser((await userFor(req)).user));
    fail(404, 'Ruta no encontrada');
  }
  // Trabajo constante cuando el correo no existe, para evitar revelar cuentas por tiempo.
  const dummyPassword = 'scrypt:00000000000000000000000000000000:' + '00'.repeat(64);
  async function rest(req, res, url) {
    let token;
    if (service(req)) token = signToken({ role: 'service_role' }, secret, 300);
    else if (req.headers.authorization && req.headers.authorization !== 'Bearer public') token = (await userFor(req)).token;
    const headers = {};
    for (const key of ['content-type', 'accept', 'prefer', 'range', 'range-unit', 'if-match']) if (req.headers[key]) headers[key] = req.headers[key];
    if (token) headers.Authorization = `Bearer ${token}`;
    const path = url.pathname.replace('/backend/rest/v1', '') + url.search;
    const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await bodyBytes(req, 20 * 1048576);
    const upstream = await fetch(`http://127.0.0.1:3002${path}`, { method: req.method, headers, body });
    res.statusCode = upstream.status;
    for (const key of ['content-type', 'content-range', 'preference-applied', 'location']) if (upstream.headers.has(key)) res.setHeader(key, upstream.headers.get(key));
    res.end(Buffer.from(await upstream.arrayBuffer()));
  }
  async function storage(req, res, url) {
    const isPublic = url.pathname.startsWith('/backend/storage/v1/object/public/');
    const prefix = isPublic ? '/backend/storage/v1/object/public/' : '/backend/storage/v1/object/';
    const [bucket, ...parts] = url.pathname.slice(prefix.length).split('/').map(decodeURIComponent);
    const name = parts.join('/');
    if (bucket === 'company-assets') return companyAsset(req, res, name, isPublic);
    if (!['despliegue-examples', 'feedback-images', 'tutorials', 'content-screenshots'].includes(bucket)) fail(404, 'Carpeta no encontrada');
    if (isPublic && (req.method === 'GET' || req.method === 'HEAD')) {
      // Las portadas y tutoriales se comparten fuera de la app. Capturas de
      // feedback y contenido exigen una sesión aunque conserven la URL histórica.
      if (!['despliegue-examples', 'tutorials'].includes(bucket)) {
        if (req.headers.authorization) await userFor(req);
        else await sessionFromCookie(req);
      }
      const { rows } = await pool.query('select * from app_private.files where bucket=$1 and name=$2', [bucket, name]);
      if (!rows[0]) fail(404, 'Archivo no encontrado');
      const file = rows[0];
      res.setHeader('Content-Type', file.mime);
      res.setHeader('Content-Length', file.size);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      if (!/^(image\/(jpeg|png|gif|webp|avif)|video\/(mp4|webm)|audio\/(mpeg|ogg|wav))$/.test(file.mime)) res.setHeader('Content-Disposition', 'attachment');
      res.end(req.method === 'HEAD' ? undefined : await readFile(join(filesRoot, file.id)));
      return;
    }
    const actor = service(req) ? null : (await userFor(req)).user;
    if (req.method === 'POST' && !isPublic) {
      if (!name || name.length > 500 || parts.some(p => p === '..' || p === '.' || !p || p.includes('\\'))) fail(400, 'Ruta de archivo inválida');
      const data = await bodyBytes(req, 25 * 1048576);
      const mime = String(req.headers['content-type'] || 'application/octet-stream').split(';')[0].toLowerCase();
      const { rows: existing } = await pool.query('select * from app_private.files where bucket=$1 and name=$2', [bucket, name]);
      if (existing[0] && (req.headers['x-upsert'] !== 'true' || (actor && existing[0].owner_id !== actor.id))) fail(409, 'El archivo ya existe');
      const id = randomUUID();
      await mkdir(filesRoot, { recursive: true });
      await writeFile(join(filesRoot, id), data, { mode: 0o600, flag: 'wx' });
      try {
        const saved = await pool.query('insert into app_private.files(id,bucket,name,owner_id,mime,size) values($1,$2,$3,$4,$5,$6) on conflict(bucket,name) do update set id=excluded.id,mime=excluded.mime,size=excluded.size where $7::boolean and ($8::boolean or app_private.files.owner_id=excluded.owner_id)', [id, bucket, name, actor?.id || null, mime, data.length, req.headers['x-upsert'] === 'true', !actor]);
        if (!saved.rowCount) fail(409, 'El archivo ya existe');
      } catch (error) { await unlink(join(filesRoot, id)); throw error; }
      if (existing[0]) await unlink(join(filesRoot, existing[0].id)).catch(() => {});
      return res.json({ path: name, id });
    }
    if (req.method === 'DELETE' && !isPublic) {
      const { prefixes } = await jsonBody(req);
      if (!Array.isArray(prefixes) || prefixes.length > 100) fail(400, 'Lista inválida');
      const { rows } = await pool.query('delete from app_private.files where bucket=$1 and name=any($2::text[]) and ($3::uuid is null or owner_id=$3) returning id,name', [bucket, prefixes, actor?.id || null]);
      await Promise.all(rows.map(file => unlink(join(filesRoot, file.id)).catch(() => {})));
      return res.json(rows);
    }
    fail(405, 'Método no permitido');
  }
  const companyAsset = createCompanyAssetHandler({ pool, filesRoot, userFor, sessionFromCookie, bodyBytes,
    authorize: (companyId, actor, write) => authorizeCompanyAsset(companyId, actor, write, {
      sign: user => signToken({ sub: user.id, email: user.email, role: 'authenticated' }, secret, 60),
    }),
  });
  const subscribers = new Set();
  let listener;
  let retryTimer;
  let stopped = false;
  async function listenChanges() {
    try {
      listener = await pool.connect();
      listener.on('notification', event => {
        const { table, event: type } = JSON.parse(event.payload);
        for (const res of subscribers) res.write(`data: ${JSON.stringify({ table, event: type })}\n\n`);
      });
      listener.on('error', () => { listener.release(true); listener = null; if (!stopped) retryTimer = setTimeout(listenChanges, 5000); });
      await listener.query('LISTEN inforce_changes');
    } catch { if (!stopped) retryTimer = setTimeout(listenChanges, 5000); }
  }
  listenChanges();
  async function events(req, res) {
    await sessionFromCookie(req);
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write(': connected\n\n');
    subscribers.add(res);
    const heartbeat = setInterval(async () => {
      try { await sessionFromCookie(req); res.write(': heartbeat\n\n'); }
      catch { res.end(); }
    }, 25000);
    res.on('close', () => { clearInterval(heartbeat); subscribers.delete(res); });
  }
  return {
    pool,
    async handle(req, res) {
      const url = new URL(req.url, 'http://localhost');
      if (!url.pathname.startsWith('/backend/')) return false;
      try {
        if (url.pathname.startsWith('/backend/auth/v1/')) await auth(req, res, url);
        else if (url.pathname.startsWith('/backend/rest/v1/')) await rest(req, res, url);
        else if (url.pathname.startsWith('/backend/storage/v1/object/')) await storage(req, res, url);
        else if (url.pathname === '/backend/events' && req.method === 'GET') await events(req, res);
        else fail(404, 'Ruta no encontrada');
      } catch (error) {
        const status = Number.isInteger(error.status) ? error.status : 500;
        if (status === 500) console.error('[backend]', url.pathname, error.code || error.name);
        if (!res.headersSent) res.status(status).json({ message: status === 500 ? 'No se pudo completar la operación' : error.message });
        else res.end();
      }
      return true;
    },
    async close() { stopped = true; clearTimeout(retryTimer); for (const res of subscribers) res.end(); if (listener) listener.release(true); await pool.end(); },
  };
}
