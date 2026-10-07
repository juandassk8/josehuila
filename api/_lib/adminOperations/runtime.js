import { commandsRedis, crawlQueue, getMediaQueue } from '../adLibrary/queue.js';
import { MAX_PROXY_ROUTES, proxyLabel } from '../../../shared/proxyPool.js';

export const HEARTBEAT_PREFIX = 'adlib:admin:heartbeat:';
export async function bounded(work, ms = 2500) {
  let timer;
  try { return await Promise.race([work, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('QUEUE_UNAVAILABLE')), ms); })]); }
  finally { clearTimeout(timer); }
}

export function safeHeartbeat(raw, now = Date.now()) {
  let row;
  try { row = JSON.parse(raw); } catch { return null; }
  if (!row || !Number.isFinite(Date.parse(row.at)) || now - Date.parse(row.at) > 120_000 || Date.parse(row.at) > now + 30_000) return null;
  // Allowlist: never forward a serialized environment, proxy address or queue job payload.
  return { at: row.at, revision: Number.isInteger(row.revision) ? row.revision : null,
    settingsAvailable: row.settingsAvailable === true, scraplingConfigured: row.scraplingConfigured === true,
    proxyRevision: Number.isInteger(row.proxyRevision) ? row.proxyRevision : null,
    paidApiConfigured: row.paidApiConfigured === true, concurrency: Number(row.concurrency) || null,
    proxies: Array.isArray(row.proxies) ? row.proxies.slice(0, MAX_PROXY_ROUTES).map((proxy, i) => ({
      label: proxyLabel(i), retryAt: Number.isFinite(Date.parse(proxy.retryAt)) ? proxy.retryAt : null,
    })) : [], proxyStatusAvailable: row.proxyStatusAvailable === true };
}

async function queueSnapshot(factory) {
  try { return await bounded((async () => {
    const queue = factory();
    const [counts, workers, paused] = await Promise.all([
      queue.getJobCounts('wait', 'active', 'delayed', 'prioritized', 'failed', 'paused'), queue.getWorkersCount(), queue.isPaused(),
    ]);
    return { available: true, counts, workers, paused };
  })()); } catch { return { available: false }; }
}

export async function readRuntime({ crawlFactory = crawlQueue, mediaFactory = getMediaQueue, redisFactory = commandsRedis } = {}) {
  const [crawls, media, signals] = await Promise.all([
    queueSnapshot(crawlFactory), queueSnapshot(mediaFactory),
    bounded((async () => {
      const queue = crawlFactory();
      const redis = redisFactory();
      const [worker, scheduler, ttl] = await Promise.all([
        redis.get(`${HEARTBEAT_PREFIX}worker`), redis.get(`${HEARTBEAT_PREFIX}scheduler`), queue.getRateLimitTtl(),
      ]);
      return { worker: safeHeartbeat(worker), scheduler: safeHeartbeat(scheduler),
        retryAt: ttl > 0 ? new Date(Date.now() + ttl).toISOString() : null };
    })()).catch(() => ({ worker: null, scheduler: null, retryAt: null })),
  ]);
  return { crawls, media, ...signals };
}
