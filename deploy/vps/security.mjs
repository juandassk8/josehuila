import { createHmac, createHash, randomBytes, scrypt as derive, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(derive);
export const digest = value => createHash('sha256').update(value).digest('hex');
export const randomToken = () => randomBytes(32).toString('base64url');
export function equal(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aa = Buffer.from(a), bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
export function signToken(payload, secret, duration = 900) {
  if (!secret || secret.length < 32) throw new Error('JWT secret must contain at least 32 characters');
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(JSON.stringify({ ...payload, iss: 'inforce-local', iat: now, exp: now + duration })).toString('base64url');
  const unsigned = `${header}.${body}`;
  return `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
}
export function verifyToken(token, secret) {
  try {
    const parts = String(token).split('.');
    if (parts.length !== 3) return null;
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    if (header.alg !== 'HS256') return null;
    const signature = createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest('base64url');
    if (!equal(signature, parts[2])) return null;
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (claims.iss !== 'inforce-local' || !Number.isFinite(claims.exp) || claims.exp <= Date.now() / 1000) return null;
    return claims;
  } catch { return null; }
}
export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 1024) {
    throw Object.assign(new Error('La contraseña debe tener entre 8 y 1024 caracteres'), { status: 400 });
  }
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt:${salt}:${hash.toString('hex')}`;
}
export async function checkPassword(password, stored) {
  try {
    if (typeof password !== 'string' || password.length > 1024) return false;
    const [kind, salt, expected] = String(stored).split(':');
    if (kind !== 'scrypt' || !salt || !expected) return false;
    const hash = await scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    return equal(hash.toString('hex'), expected);
  } catch { return false; }
}
