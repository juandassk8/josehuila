import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { AuthError, serviceClient } from '../auth.js';
import { ScrapeGraphPilot } from '../adLibrary/scrapeGraphPilot.js';

const AAD = Buffer.from('inforce:scrapegraph-api-key:v1');
const COLUMNS = 'revision,encrypted_value,updated_at,checked_at,check_status,remaining,used';
const CHECK_CODES = new Set(['SGAI_AUTH_FAILED', 'SGAI_CREDITS_EXHAUSTED', 'SGAI_RATE_LIMITED',
  'SGAI_TRANSPORT_FAILED', 'SGAI_SERVICE_FAILED', 'SGAI_RESPONSE_INVALID', 'SGAI_RESPONSE_TOO_LARGE']);

function encryptionKey(env) {
  // Reuse the installation's protected master key, with a distinct authenticated context.
  if (!/^[a-f0-9]{64}$/i.test(env.ADLIB_PROXY_ENCRYPTION_KEY || '')) throw new Error('SGAI_ENCRYPTION_UNAVAILABLE');
  return Buffer.from(env.ADLIB_PROXY_ENCRYPTION_KEY, 'hex');
}
export function encryptScrapeGraphKey(value, env = process.env) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', encryptionKey(env), iv);
  cipher.setAAD(AAD);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}
function decryptKey(value, env) {
  try {
    const [version, iv, tag, encrypted, extra] = value.split('.');
    if (version !== 'v1' || extra || !encrypted) throw new Error();
    const cipher = createDecipheriv('aes-256-gcm', encryptionKey(env), Buffer.from(iv, 'base64url'));
    cipher.setAAD(AAD); cipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([cipher.update(Buffer.from(encrypted, 'base64url')), cipher.final()]).toString('utf8');
  } catch { throw new Error('SGAI_CONFIGURATION_UNAVAILABLE'); }
}
function data(result) {
  if (result.error?.code === '40001') throw new AuthError(409, 'Otro administrador cambió la clave. Recarga antes de continuar.');
  if (result.error || !result.data) throw new Error('SGAI_CONFIGURATION_UNAVAILABLE');
  return result.data;
}
async function readRow(client) {
  return data(await client.from('admin_scrapegraph_settings').select(COLUMNS).eq('id', true).single());
}
function metadata(row, env) {
  let writable = true; try { encryptionKey(env); } catch { writable = false; }
  return { revision: row.revision, configured: !!row.encrypted_value, writable, automaticEnabled: false,
    updatedAt: row.updated_at, check: row.checked_at ? { at: row.checked_at, status: row.check_status,
      remaining: row.remaining, used: row.used } : null };
}
function revision(input, row) {
  if (!Number.isInteger(input.revision) || input.revision < 0) throw new AuthError(400, 'Versión de configuración inválida.');
  if (input.revision !== row.revision) throw new AuthError(409, 'Otro administrador cambió la clave. Recarga antes de continuar.');
}
export async function readScrapeGraphSettings(client = serviceClient(), env = process.env) {
  return metadata(await readRow(client), env);
}
// Server-side only. This function is never used by a read endpoint.
export async function loadScrapeGraphKey(client = serviceClient(), env = process.env) {
  const row = await readRow(client);
  if (!row.encrypted_value) throw new Error('SGAI_KEY_MISSING');
  return decryptKey(row.encrypted_value, env);
}
export async function saveScrapeGraphSettings(input, actor, { client = serviceClient(), env = process.env } = {}) {
  const row = await readRow(client); revision(input, row);
  let encrypted = null;
  if (input.mode === 'replace') {
    if (typeof input.apiKey !== 'string' || !/^[\x21-\x7e]{1,512}$/.test(input.apiKey.trim())) {
      throw new AuthError(400, 'Introduce una clave válida, sin espacios ni saltos de línea.');
    }
    encrypted = encryptScrapeGraphKey(input.apiKey.trim(), env);
  } else if (input.mode !== 'remove' || input.apiKey) throw new AuthError(400, 'Selecciona guardar o quitar la clave.');
  data(await client.rpc('admin_save_scrapegraph', { p_actor: actor, p_revision: row.revision, p_encrypted: encrypted }));
  return readScrapeGraphSettings(client, env);
}
export async function checkScrapeGraphSettings(input, actor, { client = serviceClient(), env = process.env, Pilot = ScrapeGraphPilot } = {}) {
  const row = await readRow(client); revision(input, row);
  if (!row.encrypted_value) throw new AuthError(400, 'Primero guarda tu clave de ScrapeGraphAI.');
  const apiKey = decryptKey(row.encrypted_value, env);
  let status = 'connected', remaining = null, used = null;
  try {
    // Only GET /credits. Never call /scrape or reserve a paid attempt here.
    const credits = await new Pilot({ apiKey }).credits();
    remaining = credits.remaining; used = credits.used;
  } catch (error) { status = CHECK_CODES.has(error.message) ? error.message : 'SGAI_SERVICE_FAILED'; }
  // A result from a replaced/removed key must not validate the new configuration.
  data(await client.rpc('admin_check_scrapegraph', { p_actor: actor, p_revision: row.revision,
    p_status: status, p_remaining: remaining, p_used: used }));
  return readScrapeGraphSettings(client, env);
}
