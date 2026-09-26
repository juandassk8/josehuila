import { AuthError, getUser } from './_lib/auth.js';
import { creativeDb } from './_lib/creativeImages/db.js';
import { settings, READ_SCOPE, WRITE_SCOPE, registerClient, validateClient, approve, exchange, throttle, digest } from './_lib/creativeImages/oauth.js';

export const config = { api: { bodyParser: { sizeLimit: '16kb' } } };
export default async function handler(req, res) {
  try {
    const cfg = settings();
    const action = req.query.action;
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'GET' && action === 'resource') return res.json({ resource: cfg.resource,
      authorization_servers: [cfg.issuer], scopes_supported: [READ_SCOPE, WRITE_SCOPE], bearer_methods_supported: ['header'] });
    if (req.method === 'GET' && action === 'metadata') return res.json({ issuer: cfg.issuer,
      authorization_endpoint: `${cfg.issuer}/api/creative-mcp-auth?action=authorize`,
      token_endpoint: `${cfg.issuer}/api/creative-mcp-auth?action=token`,
      registration_endpoint: `${cfg.issuer}/api/creative-mcp-auth?action=register`,
      revocation_endpoint: `${cfg.issuer}/api/creative-mcp-auth?action=revoke`,
      response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['none'], code_challenge_methods_supported: ['S256'],
      scopes_supported: [READ_SCOPE, WRITE_SCOPE], authorization_response_iss_parameter_supported: true });
    throttle(req, action, action === 'register' ? 10 : 60);
    const db = creativeDb();
    if (req.method === 'POST' && action === 'register') return res.status(201).json(await registerClient(db, req.body, cfg));
    if (req.method === 'POST' && action === 'token') return res.json(await exchange(db, req.body, cfg));
    if (req.method === 'POST' && action === 'revoke') {
      if (typeof req.body.token === 'string' && req.body.token.length <= 128 && typeof req.body.client_id === 'string') {
        await db.query(`update app_private.creative_mcp_grants set revoked_at=now()
          where client_id=$1 and (access_hash=$2 or refresh_hash=$2)`, [req.body.client_id, digest(req.body.token)]);
      }
      return res.json({});
    }
    if (req.method === 'GET' && action === 'authorize') {
      const input = await validateClient(db, req.query, cfg);
      const target = new URL('/creative-connect', cfg.issuer);
      target.searchParams.set('request', Buffer.from(JSON.stringify(input)).toString('base64url'));
      res.setHeader('Location', target.href); return res.status(302).send('');
    }
    if (req.method === 'POST' && action === 'inspect') {
      await getUser(req);
      const input = await validateClient(db, req.body.request, cfg);
      return res.json({ scope: input.scope, client: 'ChatGPT', redirect_origin: new URL(input.redirect_uri).origin });
    }
    if (req.method === 'POST' && action === 'approve') {
      const user = await getUser(req);
      return res.json(await approve(db, user.id, req.body.companyId, req.body.request, cfg));
    }
    return res.status(404).json({ error: 'Acción no disponible' });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 500;
    res.status(status).json({ error: status === 500 ? 'No se pudo completar la conexión' : error.message });
  }
}
