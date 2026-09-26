import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import { AuthError } from './_lib/auth.js';
import { creativeDb } from './_lib/creativeImages/db.js';
import { settings, authenticate, throttle, READ_SCOPE, WRITE_SCOPE } from './_lib/creativeImages/oauth.js';
import { creativeService } from './_lib/creativeImages/service.js';
import { makeCreativeMcp } from './_lib/creativeImages/mcp.js';

export const config = { api: { bodyParser: { sizeLimit: '32kb' } } };
export default async function handler(req, res) {
  let server, transport;
  try {
    const config = settings();
    // Only same-site browser requests or the ChatGPT host; server-to-server MCP omits Origin.
    if (req.headers.origin && ![config.issuer, 'https://chatgpt.com'].includes(req.headers.origin)) throw new AuthError(403, 'Origen inválido');
    if (!['GET', 'HEAD', 'POST'].includes(req.method)) { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Usa Streamable HTTP POST' }); }
    throttle(req, 'mcp', 180);
    const db = creativeDb();
    const actor = await authenticate(db, req, config);
    // Discovery clients may probe GET/HEAD first. Challenge before rejecting SSE.
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Usa Streamable HTTP POST' }); }
    server = makeCreativeMcp(actor, creativeService({ db }));
    transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    if (res.headersSent) return;
    if (error.status === 401) {
      const { issuer } = settings();
      res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${issuer}/.well-known/oauth-protected-resource/api/creative-mcp", scope="${READ_SCOPE} ${WRITE_SCOPE}"`);
    }
    res.status(error.status || 500).json({ error: error instanceof AuthError ? error.message : 'Conector no disponible' });
  } finally { await transport?.close(); await server?.close(); }
}
