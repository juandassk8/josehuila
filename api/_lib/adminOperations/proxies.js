import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { AuthError, serviceClient } from '../auth.js';
import { isPrivateAddress } from '../safeUrl.js';
import { proxiesFromEnv } from '../adLibrary/metaWeb.js';
import { MAX_PROXY_ROUTES, isProxySlot } from '../../../shared/proxyPool.js';

const AAD = Buffer.from('inforce:collection-proxies:v1');
const COLUMNS = 'revision,encrypted_value,routes,updated_at';
const invalid = message => { throw new AuthError(400, message); };
const slots = ['primary', 'backup'];
const controlCharacters = text => [...text].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127);
function encryptionKey(env) {
  if (!/^[a-f0-9]{64}$/i.test(env.ADLIB_PROXY_ENCRYPTION_KEY || '')) throw new Error('PROXY_KEY_UNAVAILABLE');
  return Buffer.from(env.ADLIB_PROXY_ENCRYPTION_KEY, 'hex');
}
export function encryptProxies(routes, env = process.env) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', encryptionKey(env), iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(routes), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
}
export function decryptProxies(value, env = process.env) {
  try {
    const [v, iv, tag, ciphertext, extra] = value.split('.');
    if (v !== 'v1' || extra || !ciphertext) throw new Error();
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(env), Buffer.from(iv, 'base64url'));
    decipher.setAAD(AAD); decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    const routes = JSON.parse(Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8'));
    if (!Array.isArray(routes) || !routes.length || routes.length > MAX_PROXY_ROUTES) throw new Error();
    return routes;
  } catch { throw new Error('PROXY_CONFIGURATION_UNAVAILABLE'); }
}
function canonicalServer(raw) {
  if (typeof raw !== 'string' || raw.length > 300) invalid('Escribe la dirección del proxy y su puerto.');
  let url;
  try { url = new URL(raw.trim()); } catch { invalid('Usa socks5://IP:puerto o http://IP:puerto.'); }
  const port = Number(raw.trim().match(/:(\d+)\/?$/)?.[1]);
  if (!['http:', 'socks5:'].includes(url.protocol) || !port || port > 65535 || url.username || url.password || url.search || url.hash
    || url.pathname.replace(/^\/$/, '') || !/^[a-z0-9.-]+$/i.test(url.hostname)
    || /(^|\.)(localhost|local|internal)$/.test(url.hostname)) invalid('Usa un proxy público HTTP o SOCKS5 con puerto. Las credenciales van en sus campos.');
  return `${url.protocol}//${url.hostname}:${port}`;
}
// Pin the public IPv4 for this connection. DNS cannot change between validation and use.
export async function resolveProxy(proxy, { lookupFn = lookup } = {}) {
  const server = canonicalServer(proxy.server), url = new URL(server);
  let addresses;
  try {
    let timer;
    try { addresses = isIP(url.hostname) ? [{address:url.hostname}] : await Promise.race([
      lookupFn(url.hostname, { all:true, family:4 }), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error()), 5000); }),
    ]); } finally { clearTimeout(timer); }
  } catch { invalid('No se pudo resolver la dirección del proxy. Revisa el servidor.'); }
  if (!addresses?.length || addresses.some(a => isIP(a.address) !== 4 || isPrivateAddress(a.address))) invalid('El proxy debe tener una dirección IPv4 pública.');
  return { ...proxy, server:`${url.protocol}//${addresses[0].address}:${url.port || 80}` };
}
function metadata(routes) { return routes.map((p, i) => ({ slot:p.slot || slots[i], server:p.server, hasCredentials:!!p.username })); }
function connection(proxy) { return {server:proxy.server, ...(proxy.username ? {username:proxy.username,password:proxy.password} : {})}; }
async function readRow(client) {
  const result = await client.from('admin_proxy_settings').select(COLUMNS).eq('id', true).single();
  if (result.error || !result.data) throw new Error('PROXY_SETTINGS_UNAVAILABLE');
  return result.data;
}
function effective(row, env) {
  const routes=(row.encrypted_value ? decryptProxies(row.encrypted_value, env) : proxiesFromEnv(env)).map((p,i)=>({...p,slot:p.slot || slots[i]}));
  if(routes.some(p=>!isProxySlot(p.slot)) || new Set(routes.map(p=>p.slot)).size!==routes.length || (routes.length && routes[0].slot!=='primary')) throw new Error('PROXY_CONFIGURATION_UNAVAILABLE');
  return routes;
}
export async function readProxySettings(client = serviceClient(), env = process.env) {
  const row = await readRow(client);
  let writable = true; try { encryptionKey(env); } catch { writable = false; }
  return { revision:row.revision, maxRoutes:MAX_PROXY_ROUTES, routes:row.encrypted_value ? row.routes : metadata(proxiesFromEnv(env)),
    source:row.encrypted_value ? 'panel' : 'server', updatedAt:row.updated_at, writable };
}
export async function loadCollectionProxies(client = serviceClient(), env = process.env) {
  const row = await readRow(client), routes = effective(row, env);
  // Preserve legacy configuration until the first explicit save in the panel.
  return { revision:row.revision, proxies:row.encrypted_value ? await Promise.all(routes.map(p => resolveProxy(connection(p)))) : routes.map(connection) };
}
function checkRevision(revision, row) {
  if (!Number.isInteger(revision) || revision < 0) invalid('Versión de configuración inválida.');
  if (revision !== row.revision) throw new AuthError(409, 'Otro administrador cambió los proxies. Recarga antes de continuar.');
}
export async function prepareProxy(draft, previous, resolve = resolveProxy) {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)
    || Object.keys(draft).some(k => !['slot','server','credentials','username','password'].includes(k))) invalid('Configuración de proxy inválida.');
  const server = canonicalServer(draft.server);
  let proxy = {server};
  if (draft.credentials === 'keep') {
    if (!previous || previous.server !== server || draft.username || draft.password) invalid('Al cambiar la dirección, vuelve a introducir las credenciales o selecciona Sin autenticación.');
    proxy = { ...previous, server };
  } else if (draft.credentials === 'replace') {
    if (typeof draft.username !== 'string' || typeof draft.password !== 'string' || !draft.username.trim() || !draft.password
      || controlCharacters(draft.username) || draft.username.includes(':') || controlCharacters(draft.password)
      || Buffer.byteLength(draft.username.trim()) > 255 || Buffer.byteLength(draft.password) > 255) invalid('Completa el usuario y la contraseña (máximo 255 bytes, sin saltos de línea).');
    proxy.username = draft.username.trim(); proxy.password = draft.password;
  } else if (draft.credentials !== 'none' || draft.username || draft.password) invalid('Selecciona cómo se autentica el proxy.');
  const pinned = await resolve(proxy);
  return { proxy, pinned };
}
export async function saveProxySettings(input, actor, { client = serviceClient(), env = process.env, resolve = resolveProxy } = {}) {
  const row = await readRow(client); checkRevision(input.revision, row);
  const drafts = input.routes;
  if (!Array.isArray(drafts) || !drafts.length || drafts.length > MAX_PROXY_ROUTES || drafts[0]?.slot!=='primary'
    || drafts.some(p=>!isProxySlot(p?.slot)) || new Set(drafts.map(p=>p.slot)).size!==drafts.length) invalid(`Configura un proxy principal y hasta ${MAX_PROXY_ROUTES-1} respaldos con identificadores únicos.`);
  const previous = effective(row, env), routes = [];
  for (const draft of drafts) routes.push({...((await prepareProxy(draft, previous.find(p=>p.slot===draft.slot), resolve)).proxy),slot:draft.slot});
  if (new Set(routes.map(p=>JSON.stringify([p.server,p.username || '']))).size!==routes.length) invalid('Cada respaldo debe ser una conexión diferente.');
  const result = await client.rpc('admin_save_proxy_settings', {p_actor:actor, p_revision:input.revision,
    p_encrypted:encryptProxies(routes, env), p_routes:metadata(routes)});
  if (result.error?.code === '40001') throw new AuthError(409, 'Otro administrador cambió los proxies. Recarga antes de guardar.');
  if (result.error) throw new Error('PROXY_SETTINGS_UNAVAILABLE');
  return { revision:result.data.revision, maxRoutes:MAX_PROXY_ROUTES, routes:metadata(routes), source:'panel', updatedAt:result.data.updated_at, writable:true };
}
export async function prepareProxyTest(input, { client = serviceClient(), env = process.env, resolve = resolveProxy } = {}) {
  const row = await readRow(client); checkRevision(input.revision, row);
  if (!isProxySlot(input.route?.slot)) invalid('Proxy inválido.');
  return connection((await prepareProxy(input.route, effective(row, env).find(p=>p.slot===input.route.slot), resolve)).pinned);
}
