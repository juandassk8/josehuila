import pg from 'pg';
import { AuthError } from '../auth.js';

let pool;
export function creativeDb() {
  pool ||= new pg.Pool({ host: process.env.PGHOST || '/var/run/postgresql',
    database: process.env.PGDATABASE || 'inforce', user: process.env.PGUSER || 'inforce', max: 3 });
  return pool;
}
export async function access(db, userId, companyId) {
  if (typeof companyId !== 'string' || !companyId || companyId.length > 128) throw new AuthError(400, 'Empresa inválida');
  const { rows } = await db.query('select app_private.creative_company_access($1,$2) as allowed', [userId, companyId]);
  if (!rows[0]?.allowed) throw new AuthError(403, 'No tienes acceso a esta empresa');
}
export async function contextFor(db, actor, adId = null) {
  const { rows } = await db.query('select app_private.creative_context($1,$2,$3) as context', [actor.user_id, actor.company_id, adId]);
  return rows[0].context;
}
export function pickReference(context, adId, productId) {
  const ad = context.references.find(item => item.id === adId);
  const product = context.products.find(item => item.id === productId);
  if (!ad?.media?.length) throw new AuthError(404, 'Guarda primero un anuncio de imagen con medios disponibles en la biblioteca de esta empresa');
  if (!product) throw new AuthError(404, 'Producto no disponible en esta empresa');
  return { ad, product };
}
