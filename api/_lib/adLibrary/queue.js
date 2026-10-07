import { Queue } from 'bullmq';
import Redis from 'ioredis';

let queue;
let mediaQueue;
let commandConnection;

// BullMQ 6 exposes a backend, not a raw queue.client/worker.client. Application
// keys (heartbeats, connection checks, cooldowns) use our explicit Redis client.
export function commandsRedis() {
  if (!commandConnection) {
    commandConnection = new Redis({ ...redisConnection({ producer: true }), commandTimeout: 5000 });
    commandConnection.on('error', () => {}); // Callers return sanitized availability states.
  }
  return commandConnection;
}

export function redisConnection({ producer = false } = {}) {
  const raw = process.env.ADLIB_REDIS_URL;
  if (!raw) throw new Error('ADLIB_REDIS_URL not configured');
  const url = new URL(raw);
  if (!['redis:', 'rediss:'].includes(url.protocol)) throw new Error('Invalid Redis URL');
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: decodeURIComponent(url.username || 'default'),
    password: decodeURIComponent(url.password || ''),
    tls: url.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: producer ? 1 : null,
    connectTimeout: 5000,
  };
}

export function crawlQueue() {
  if (!queue) {
    queue = new Queue('ad-library-crawls', { connection: redisConnection({ producer: true }) });
    queue.on('error', error => console.error('[ad-library-queue]', error.name));
  }
  return queue;
}

export async function sourceRetryAt() {
  let timer;
  try {
    const ttl = await Promise.race([crawlQueue().getRateLimitTtl(), new Promise(resolve => { timer = setTimeout(() => resolve(0), 1000); })]);
    return ttl > 0 ? new Date(Date.now() + ttl).toISOString() : null;
  } catch { return null; }
  finally { clearTimeout(timer); }
}

export async function crawlQueueStatus(brandId, { queueFactory = crawlQueue, timeoutMs = 2500 } = {}) {
  let timer;
  try {
    return await Promise.race([(async () => {
      const selectedQueue = queueFactory();
      const [job, ttl, paused, workers] = await Promise.all([
        selectedQueue.getJob(`brand-${brandId}`), selectedQueue.getRateLimitTtl(),
        selectedQueue.isPaused(), selectedQueue.getWorkersCount(),
      ]);
      const state = job ? await job.getState() : null;
      return { available: true, paused, workers, retryAt: ttl > 0 ? new Date(Date.now() + ttl).toISOString() : null,
        job: job ? { state, progress: typeof job.progress === 'object' ? job.progress : null } : null };
    })(), new Promise(resolve => { timer = setTimeout(() => resolve({ available: false }), timeoutMs); })]);
  } catch { return { available: false }; }
  finally { clearTimeout(timer); }
}

// Menor número = antes. BullMQ procesa primero los trabajos sin prioridad (0),
// por eso las actualizaciones programadas también llevan una: así una marca
// recién seguida nunca espera detrás del catálogo.
export const CRAWL_PRIORITY = { first_import: 1, manual: 2, scheduled: 10 };

export async function enqueueBrand(brandId, { reason = 'scheduled', queueFactory = crawlQueue } = {}) {
  const priority = CRAWL_PRIORITY[reason] ?? CRAWL_PRIORITY.scheduled;
  const queue = queueFactory();
  const existing = await queue.getJob(`brand-${brandId}`);
  if (existing) {
    // Solo adelanta trabajos que siguen esperando; nunca los duplica, retrasa ni reinicia.
    const current = existing.priority ?? existing.opts?.priority ?? 0;
    if ((current === 0 || priority < current) && ['waiting', 'prioritized'].includes(await existing.getState()))
      await existing.changePriority({ priority });
    return existing;
  }
  return queue.add('crawl-brand', { brandId }, {
    jobId: `brand-${brandId}`,
    priority,
    attempts: 3,
    backoff: { type: 'exponential', delay: 60_000 },
    removeOnComplete: true,
    removeOnFail: true, // El historial de fallos queda en PostgreSQL.
  });
}

export function getMediaQueue() {
  if (!mediaQueue) {
    mediaQueue = new Queue('ad-library-media', { connection: redisConnection({ producer: true }) });
    mediaQueue.on('error', error => console.error('[ad-library-media-queue]', error.name));
  }
  return mediaQueue;
}

export async function enqueuePreview(sha256) {
  return getMediaQueue().add('preview-media', { sha256 }, {
    jobId: `preview-${sha256}`, attempts: 3, backoff: { type: 'exponential', delay: 60_000 },
    removeOnComplete: true, removeOnFail: 100,
  });
}

export async function enqueueMedia(adId, contentHash, assets) {
  return getMediaQueue().add('archive-media', { adId, contentHash, assets }, {
    jobId: `media-${adId}-${contentHash}`, attempts: 3,
    backoff: { type: 'exponential', delay: 60_000 },
    removeOnComplete: true, removeOnFail: true,
  });
}
