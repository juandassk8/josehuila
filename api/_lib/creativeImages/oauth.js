import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AuthError } from '../auth.js';
import { access } from './db.js';

export const READ_SCOPE = 'creatives:read';
export const WRITE_SCOPE = 'creatives:write';
const fail = (message, status = 400) => { throw new AuthError(status, message); };
export const digest = value => createHash('sha256').update(value).digest('hex');
const secret = () => randomBytes(32).toString('base64url');
export const challenge = value => createHash('sha256').update(value).digest('base64url');
export function settings() {
  if (process.env.CREATIVE_MCP_ENABLED !== '1') fail('El conector de creativos todavía no está activado', 503);
  const base = new URL(process.env.PUBLIC_BASE_URL);
  if (base.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(base.hostname)) fail('Configura HTTPS para el conector', 503);
  return { issuer: base.origin, resource: `${base.origin}/api/creative-mcp`,
    redirects: (process.env.CREATIVE_MCP_REDIRECT_URIS || 'https://chatgpt.com/connector_platform_oauth_redirect').split(',').map(s => s.trim()) };
}
export function scopes(value = READ_SCOPE) {
  const parts = [...new Set(String(value).split(' ').filter(Boolean))];
  if (!parts.length || parts.some(item => ![READ_SCOPE, WRITE_SCOPE].includes(item)) || !parts.includes(READ_SCOPE)) fail('invalid_scope');
  return parts.sort().join(' ');
}
export function authorizationInput(input, config) {
  if (!input || typeof input !== 'object') fail('invalid_request');
  if (input.response_type !== 'code' || input.code_challenge_method !== 'S256'
    || !/^[A-Za-z0-9_-]{43}$/.test(input.code_challenge || '')) fail('invalid_request');
  if (!config.redirects.includes(input.redirect_uri)) fail('invalid_redirect_uri');
  if (input.resource !== config.resource) fail('invalid_target');
  if (typeof input.client_id !== 'string' || input.client_id.length > 150
    || typeof input.state !== 'string' || !input.state || input.state.length > 1024) fail('invalid_request');
  return { client_id: input.client_id, redirect_uri: input.redirect_uri, resource: input.resource,
    response_type: 'code', code_challenge: input.code_challenge, code_challenge_method: 'S256',
    state: input.state, scope: scopes(input.scope) };
}
export async function validateClient(db, input, config) {
  const parsed = authorizationInput(input, config);
  const { rows } = await db.query('select id from app_private.creative_mcp_clients where id=$1 and redirect_uri=$2', [parsed.client_id, parsed.redirect_uri]);
  if (!rows.length) fail('invalid_client');
  return parsed;
}
export async function registerClient(db, input, config) {
  if (!Array.isArray(input.redirect_uris) || input.redirect_uris.length !== 1
    || !config.redirects.includes(input.redirect_uris[0])
    || (input.token_endpoint_auth_method && input.token_endpoint_auth_method !== 'none')) fail('invalid_client_metadata');
  const id = `chatgpt-${randomUUID()}`;
  await db.query('insert into app_private.creative_mcp_clients(id,redirect_uri) values($1,$2)', [id, input.redirect_uris[0]]);
  return { client_id: id, client_id_issued_at: Math.floor(Date.now()/1000), redirect_uris: input.redirect_uris,
    token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] };
}
export async function approve(db, userId, companyId, input, config) {
  const parsed = await validateClient(db, input, config);
  await access(db, userId, companyId);
  const code = secret();
  await db.query(`insert into app_private.creative_mcp_codes(code_hash,client_id,redirect_uri,challenge,resource,scope,user_id,user_version,company_id,expires_at)
    select $1,$2,$3,$4,$5,$6,id,token_version,$8,now()+interval '5 minutes' from auth.users where id=$7 and not disabled`,
  [digest(code), parsed.client_id, parsed.redirect_uri, parsed.code_challenge, parsed.resource, parsed.scope, userId, companyId]);
  const redirect = new URL(parsed.redirect_uri);
  redirect.searchParams.set('code', code); redirect.searchParams.set('state', parsed.state); redirect.searchParams.set('iss', config.issuer);
  return { redirect: redirect.href };
}
export async function exchange(pool, input, config) {
  if (input.resource !== config.resource) fail('invalid_target');
  if (typeof input.client_id !== 'string') fail('invalid_client');
  if (!['authorization_code', 'refresh_token'].includes(input.grant_type)) fail('unsupported_grant_type');
  const db = await pool.connect();
  try {
    await db.query('begin');
    let grant;
    if (input.grant_type === 'authorization_code') {
      if (typeof input.code !== 'string' || input.code.length > 128
        || !/^[A-Za-z0-9._~-]{43,128}$/.test(input.code_verifier || '')) fail('invalid_grant');
      const { rows } = await db.query(`delete from app_private.creative_mcp_codes where code_hash=$1 and client_id=$2
        and redirect_uri=$3 and resource=$4 and challenge=$5 and expires_at>now() returning *`,
      [digest(input.code), input.client_id, input.redirect_uri, config.resource, challenge(input.code_verifier)]);
      grant = rows[0];
    } else {
      if (typeof input.refresh_token !== 'string' || input.refresh_token.length > 128) fail('invalid_grant');
      const { rows } = await db.query(`select * from app_private.creative_mcp_grants where refresh_hash=$1 and client_id=$2
        and resource=$3 and expires_at>now() and revoked_at is null for update`, [digest(input.refresh_token), input.client_id, config.resource]);
      grant = rows[0];
      // A refresh cannot widen the consented scope.
      if (input.scope && scopes(input.scope) !== grant?.scope) fail('invalid_scope');
    }
    if (!grant) fail('invalid_grant');
    const { rows } = await db.query('select id from auth.users where id=$1 and token_version=$2 and not disabled', [grant.user_id, grant.user_version]);
    if (!rows.length) fail('invalid_grant');
    await access(db, grant.user_id, grant.company_id);
    const accessToken = secret(), refreshToken = secret();
    if (input.grant_type === 'authorization_code') {
      await db.query(`insert into app_private.creative_mcp_grants(id,client_id,user_id,user_version,company_id,resource,scope,
        access_hash,refresh_hash,access_expires_at,expires_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,now()+interval '1 hour',now()+interval '30 days')`,
      [randomUUID(), grant.client_id, grant.user_id, grant.user_version, grant.company_id, grant.resource, grant.scope, digest(accessToken), digest(refreshToken)]);
    } else {
      await db.query(`update app_private.creative_mcp_grants set access_hash=$1,refresh_hash=$2,access_expires_at=now()+interval '1 hour' where id=$3`,
        [digest(accessToken), digest(refreshToken), grant.id]);
    }
    await db.query('commit');
    return { access_token: accessToken, refresh_token: refreshToken, token_type: 'Bearer', expires_in: 3600, scope: grant.scope };
  } catch (error) { await db.query('rollback'); throw error; }
  finally { db.release(); }
}
export async function authenticate(db, req, config) {
  const header = req.headers.authorization || '';
  if (!/^Bearer [A-Za-z0-9_-]{43}$/.test(header)) fail('invalid_token', 401);
  const { rows } = await db.query(`select g.* from app_private.creative_mcp_grants g join auth.users u on u.id=g.user_id
    where g.access_hash=$1 and g.resource=$2 and g.access_expires_at>now() and g.expires_at>now()
    and g.revoked_at is null and not u.disabled and u.token_version=g.user_version`, [digest(header.slice(7)), config.resource]);
  if (!rows[0]) fail('invalid_token', 401);
  await access(db, rows[0].user_id, rows[0].company_id);
  return rows[0];
}
export function requireScope(actor, scope) {
  if (!actor.scope.split(' ').includes(scope)) fail('insufficient_scope', 403);
}

// Bounded abuse protection for discovery/registration/token endpoints; not a replacement for proxy limits.
const limits = new Map();
export function throttle(req, action, maximum = 60) {
  const now = Date.now();
  for (const [key, item] of limits) if (item.until <= now) limits.delete(key);
  const key = `${req.headers['x-real-ip'] || req.socket?.remoteAddress}:${action}`;
  const item = limits.get(key) || { count: 0, until: now + 600_000 };
  if (!limits.has(key) && limits.size >= 2000) fail('rate_limited', 429);
  limits.set(key, item);
  if (++item.count > maximum) fail('rate_limited', 429);
}
