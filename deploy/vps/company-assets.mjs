import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const validCompany = /^[a-zA-Z0-9_-]{1,160}$/;
const validFile = /^[a-f0-9-]{36}\.(jpg|png|webp)$/;
export function imageMime(bytes) {
  if (bytes.length >= 12 && bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return 'image/jpeg';
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes.length >= 16 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}
export function assetPath(name) {
  const [companyId, file, ...extra] = name.split('/');
  if (!validCompany.test(companyId || '') || !validFile.test(file || '') || extra.length) fail(400, 'Ruta de imagen inválida');
  return { companyId, file };
}

// Membership/management is checked on every request with the existing RLS.
// Signed server-to-PostgREST tokens never reach the browser or URLs.
export async function authorizeCompanyAsset(companyId, actor, write, { sign, transport = fetch }) {
  const headers = { Authorization: `Bearer ${sign(actor)}`, 'Content-Type': 'application/json' };
  const query = new URLSearchParams({ select: 'id', id: `eq.${companyId}`, limit: '1' });
  const response = await transport(`http://127.0.0.1:3002/companies?${query}`, { headers });
  if (!response.ok) fail(503, 'No pudimos verificar el acceso a la empresa');
  if (!(await response.json()).length) fail(403, 'No tienes acceso a esta empresa');
  if (write) {
    const check = await transport('http://127.0.0.1:3002/rpc/can_manage_company', { method: 'POST', headers, body: JSON.stringify({ p_id: companyId }) });
    if (!check.ok) fail(503, 'No pudimos verificar los permisos de edición');
    if ((await check.json()) !== true) fail(403, 'No tienes permiso para editar esta marca');
  }
}

export function createCompanyAssetHandler({ pool, filesRoot, userFor, sessionFromCookie, authorize, bodyBytes }) {
  return async function companyAsset(req, res, name, isPublic) {
    if (isPublic) fail(404, 'Los archivos de empresa requieren una sesión');
    const { companyId, file } = assetPath(name);
    const reading = req.method === 'GET' || req.method === 'HEAD';
    if (!reading && req.method !== 'POST') fail(405, 'Método no permitido');
    // Cookies only authorize reads. Mutations always require an access token.
    const actor = req.headers.authorization ? (await userFor(req)).user : reading ? await sessionFromCookie(req) : fail(401, 'Vuelve a iniciar sesión');
    await authorize(companyId, actor, !reading);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    if (reading) {
      const { rows } = await pool.query('select id,mime,size from app_private.files where bucket=$1 and name=$2', ['company-assets', name]);
      const asset = rows[0];
      if (!asset) fail(404, 'Imagen no encontrada');
      res.setHeader('Content-Type', asset.mime);
      res.setHeader('Content-Length', asset.size);
      return res.end(req.method === 'HEAD' ? undefined : await readFile(join(filesRoot, asset.id)));
    }
    const bytes = await bodyBytes(req, 8 * 1048576);
    const mime = imageMime(bytes);
    if (!mime || mime !== { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[file.split('.').pop()]) fail(415, 'Usa una imagen JPG, PNG o WebP válida');
    const { rows: existing } = await pool.query('select id,owner_id,size from app_private.files where bucket=$1 and name=$2', ['company-assets', name]);
    if (existing[0]) {
      const old = existing[0];
      if (old.owner_id !== actor.id || Number(old.size) !== bytes.length || !(await readFile(join(filesRoot, old.id))).equals(bytes)) fail(409, 'Esta imagen ya está guardada');
      return res.json({ path: name, id: old.id });
    }
    const id = randomUUID();
    await mkdir(filesRoot, { recursive: true });
    await writeFile(join(filesRoot, id), bytes, { mode: 0o600, flag: 'wx' });
    try {
      await pool.query('insert into app_private.files(id,bucket,name,owner_id,mime,size) values($1,$2,$3,$4,$5,$6)', [id, 'company-assets', name, actor.id, mime, bytes.length]);
    } catch (error) {
      await unlink(join(filesRoot, id)).catch(() => {});
      if (error.code === '23505') fail(409, 'Esta imagen ya está guardada');
      throw error;
    }
    return res.json({ path: name, id });
  };
}
