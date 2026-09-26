import { AuthError, getUser } from './_lib/auth.js';
import { creativeDb, access } from './_lib/creativeImages/db.js';
import { creativeService } from './_lib/creativeImages/service.js';
import { settings } from './_lib/creativeImages/oauth.js';

export const config = { api: { bodyParser: { sizeLimit: '8kb' } } };
export default async function handler(req, res) {
  try {
    if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Método no permitido' });
    const cfg = settings();
    const user = await getUser(req), db = creativeDb();
    const input = req.method === 'GET' ? req.query : req.body;
    if (req.method === 'GET' && input.action === 'companies') {
      const { rows } = await db.query('select * from app_private.creative_companies($1)', [user.id]);
      return res.json({ companies: rows, mcp_url: cfg.resource });
    }
    await access(db, user.id, input.companyId);
    if (req.method === 'POST' && input.action === 'disconnect') {
      // Users revoke only their own connection; never another person's ChatGPT account.
      await db.query(`update app_private.creative_mcp_grants set revoked_at=now()
        where user_id=$1 and company_id=$2 and revoked_at is null`, [user.id, input.companyId]);
      return res.json({ disconnected: true });
    }
    if (req.method !== 'GET' || input.action !== 'list') return res.status(400).json({ error: 'Acción inválida' });
    const actor = { user_id: user.id, company_id: input.companyId };
    const [images, connections] = await Promise.all([
      creativeService({ db }).list(actor),
      db.query(`select g.id,g.scope,g.created_at,g.expires_at from app_private.creative_mcp_grants g
        join auth.users u on u.id=g.user_id and u.token_version=g.user_version and not u.disabled
        where g.user_id=$1 and g.company_id=$2 and g.revoked_at is null and g.expires_at>now()`, [user.id, input.companyId]),
    ]);
    return res.json({ images, connections: connections.rows, mcp_url: cfg.resource });
  } catch (error) {
    res.status(error instanceof AuthError ? error.status : 500).json({ error: error instanceof AuthError ? error.message : 'No se pudieron cargar los creativos' });
  }
}
