import { Queue } from 'bullmq';

let queue;
let mediaQueue;

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

export async function enqueueBrand(brandId) {
  return crawlQueue().add('crawl-brand', { brandId }, {
    jobId: `brand-${brandId}`,
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
