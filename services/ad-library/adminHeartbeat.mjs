import { readSettings } from '../../api/_lib/adminOperations/settings.js';
import { HEARTBEAT_PREFIX } from '../../api/_lib/adminOperations/runtime.js';
import { loadCollectionProxies } from '../../api/_lib/adminOperations/proxies.js';
import { RedisProxyCooldowns } from '../../api/_lib/adLibrary/proxyCooldowns.js';

export async function publishHeartbeat(role, redis, { loadSettings = readSettings, loadProxies = loadCollectionProxies, env = process.env } = {}) {
  const snapshot = { at: new Date().toISOString(), settingsAvailable: false, revision: null };
  try { const settings = await loadSettings(); snapshot.revision = settings.revision; snapshot.settingsAvailable = true; }
  catch { /* A missing migration is visible; never advertise an applied revision. */ }
  if (role === 'worker') {
    snapshot.concurrency = Number(env.ADLIB_WORKER_CONCURRENCY || 1);
    snapshot.scraplingConfigured = env.ADLIB_SCRAPLING_ENABLED === 'true' && !!env.ADLIB_SCRAPLING_URL && !!env.ADLIB_SCRAPLING_TOKEN;
    snapshot.paidApiConfigured = !!env.SGAI_API_KEY;
    snapshot.proxyStatusAvailable = false;
    try {
      const cooldowns = new RedisProxyCooldowns(redis);
      const config = await loadProxies();
      snapshot.proxyRevision = config.revision;
      snapshot.proxies = await Promise.all(config.proxies.map(async proxy => {
        const ttl = await cooldowns.remaining(proxy);
        return { retryAt: ttl > 0 ? new Date(Date.now() + ttl).toISOString() : null };
      }));
      snapshot.proxyStatusAvailable = true;
    } catch { /* Invalid config must not expose the proxy URL or password. */ }
  }
  await redis.set(`${HEARTBEAT_PREFIX}${role}`, JSON.stringify(snapshot), 'EX', 90);
}

export function startHeartbeat(role, connection) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await publishHeartbeat(role, await connection); }
    catch { console.warn('[ad-library] admin heartbeat unavailable', role); }
    finally { running = false; }
  };
  void tick();
  const timer = setInterval(tick, 30_000);
  timer.unref();
  return () => clearInterval(timer);
}
