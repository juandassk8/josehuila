import { Worker } from 'bullmq';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serviceClient } from '../../api/_lib/auth.js';
import { createCollector } from '../../api/_lib/adLibrary/collectors.js';
import { DEFAULT_SETTINGS, collectionDelayMs, readSettings } from '../../api/_lib/adminOperations/settings.js';
import { startHeartbeat } from './adminHeartbeat.mjs';
import { commandsRedis, redisConnection, enqueueMedia } from '../../api/_lib/adLibrary/queue.js';
import { rateLimitDelayMs, metaRateLimitError } from '../../api/_lib/adLibrary/retryPolicy.js';
import { assertCompletion } from '../../api/_lib/adLibrary/collectorContract.js';
import { RedisProxyCooldowns } from '../../api/_lib/adLibrary/proxyCooldowns.js';
import { loadCollectionProxies } from '../../api/_lib/adminOperations/proxies.js';
import { resolveBrand } from '../../api/_lib/adLibrary/resolveBrand.js';
import { saveSignalSnapshot } from '../../api/_lib/adLibrary/signals.js';
import { processBrandRequest } from '../../api/_lib/adLibrary/brandRequests.js';

function data(response) {
  if (response.error) throw new Error(response.error.message || 'DATABASE_ERROR');
  return response.data;
}

function plusMs(ms) { return new Date(Date.now() + ms).toISOString(); }

export async function crawlBrand(brandId, { client = serviceClient(), collectorFactory = createCollector, mediaEnqueue = enqueueMedia, onProgress = async () => {}, observedAt, collectionMethod = 'live', proxyCooldowns, proxies, settings = DEFAULT_SETTINGS } = {}) {
  const brand = data(await client.from('ad_library_brands').select('*').eq('id', brandId).single());
  const active = data(await client.from('ad_library_follows').select('id').eq('brand_id', brandId).eq('active', true).limit(1));
  if (!active.length) return { skipped: true };
  const run = data(await client.from('ad_library_crawl_runs').insert({ brand_id: brandId, collection_method: collectionMethod, ...(observedAt ? { started_at: observedAt } : {}) })
    .select('id,started_at').single());
  const startedAt = run.started_at;
  let pagesSeen = 0, adsSeen = 0, newAds = 0, changedAds = 0;
  let completion;
  const attempts = [];
  try {
    await onProgress({ pagesSeen, adsSeen });
    const collector = collectorFactory(brand.source, { proxyCooldowns, proxies, settings, onAttempt: async attempt => {
      const previous = attempts.findIndex(item => item.engine === attempt.engine && item.started_at === attempt.started_at);
      if (previous < 0) attempts.push(attempt); else attempts[previous] = attempt;
      data(await client.from('ad_library_crawl_runs').update({ collector_attempts: attempts }).eq('id', run.id));
    } });
    for await (const page of collector.pages(brand)) {
      if (completion || !Array.isArray(page?.ads)) throw new Error('COLLECTION_PROTOCOL_INVALID');
      if (page.completion) {
        if (page.ads.length) throw new Error('COLLECTION_PROTOCOL_INVALID');
        assertCompletion(page.completion, brand, collectionMethod);
        completion = page.completion;
        continue;
      }
      pagesSeen++;
      const ads = [...new Map((page.ads || []).map(ad => [ad.source_ad_id, ad])).values()];
      if (!ads.length) { await onProgress({ pagesSeen, adsSeen }); continue; }
      const ids = [...new Set(ads.map(ad => ad.source_ad_id))];
      const prior = data(await client.from('ad_library_ads').select('id,source_ad_id,content_hash,status,media_content_hash')
        .eq('brand_id', brandId).in('source_ad_id', ids));
      const oldById = new Map(prior.map(ad => [ad.source_ad_id, ad]));
      const rows = ads.map(ad => ({
        source_ad_id: ad.source_ad_id, page_name: ad.page_name,
        body: ad.body, title: ad.title, caption: ad.caption, cta: ad.cta,
        landing_url: ad.landing_url, media_type: ad.media_type, source_url: ad.source_url,
        source_start_at: ad.source_start_at, source_stop_at: ad.source_stop_at,
        status: ad.status, content_hash: ad.content_hash,
      }));
      const saved = data(await client.rpc('ad_library_upsert_ads', {
        p_brand_id: brandId, p_started_at: startedAt, p_ads: rows,
      }));
      const savedById = new Map(saved.map(ad => [ad.source_ad_id, ad]));
      const versions = [];
      for (const ad of ads) {
        const previous = oldById.get(ad.source_ad_id);
        if (!previous) newAds++;
        else if (previous.content_hash !== ad.content_hash || previous.status !== ad.status) changedAds++;
        else continue;
        const row = savedById.get(ad.source_ad_id);
        if (row) versions.push({ ad_id: row.id, content_hash: ad.content_hash, content: ad.version });
      }
      if (versions.length) data(await client.from('ad_library_versions').upsert(versions,
        { onConflict: 'ad_id,content_hash', ignoreDuplicates: true }));
      for (const ad of ads) {
        const row = savedById.get(ad.source_ad_id);
        if (row && Array.isArray(ad.media) && oldById.get(ad.source_ad_id)?.media_content_hash !== ad.content_hash)
          await mediaEnqueue(row.id, ad.content_hash, ad.media);
      }
      adsSeen += ads.length;
      await onProgress({ pagesSeen, adsSeen });
      if (ads[0]?.page_name && brand.name !== ads[0].page_name) {
        data(await client.from('ad_library_brands').update({ name: ads[0].page_name }).eq('id', brandId));
        brand.name = ads[0].page_name;
      }
    }
    assertCompletion(completion, brand, collectionMethod);
    data(await client.rpc('ad_library_finish_crawl', {
      p_brand_id: brandId, p_started_at: startedAt, p_complete: true,
    }));
    const now = new Date().toISOString();
    // Keep large ranking payloads out of the run log; the daily table owns them.
    const { ranking: _ranking, ...completionEvidence } = completion;
    data(await client.from('ad_library_crawl_runs').update({
      finished_at: now, status: 'complete', complete_scan: true,
      collector_engine: completion.engine, completion_evidence: completionEvidence,
      pages_seen: pagesSeen, ads_seen: adsSeen, new_ads: newAds, changed_ads: changedAds,
    }).eq('id', run.id));
    data(await client.from('ad_library_brands').update({
      last_crawl_at: now, last_crawl_status: 'complete',
      next_crawl_at: plusMs(collectionDelayMs(settings, { newAds, changedAds })),
    }).eq('id', brandId));
    // An optional derived snapshot failure must not invalidate a completed inventory.
    try { await saveSignalSnapshot(client, brand, run, completion, collectionMethod); }
    catch { console.error('[ad-library] SIGNAL_SNAPSHOT_FAILED', run.id); }
    return { pagesSeen, adsSeen, newAds, changedAds };
  } catch (error) {
    const now = new Date().toISOString();
    const code = /^[A-Z0-9_]{1,80}$/.test(error?.message || '') ? error.message : 'CRAWL_FAILED';
    // Una corrida parcial queda visible en el log, pero nunca marca ausencias.
    await client.from('ad_library_crawl_runs').update({
      finished_at: now, status: 'failed', complete_scan: false,
      pages_seen: pagesSeen, ads_seen: adsSeen, new_ads: newAds, changed_ads: changedAds,
      error_code: code,
    }).eq('id', run.id);
    await client.from('ad_library_brands').update({
      last_crawl_at: now, last_crawl_status: 'failed',
      next_crawl_at: plusMs(code === 'META_RATE_LIMITED' ? rateLimitDelayMs(error) : collectionDelayMs(settings, { failed: true })),
    }).eq('id', brandId);
    if (code === 'META_RATE_LIMITED') throw metaRateLimitError(rateLimitDelayMs(error));
    throw new Error(code, { cause: error });
  }
}

export async function processCrawlJob(job, worker, { crawl = crawlBrand, resolveIdentity = resolveBrand, processRequest = processBrandRequest, loadSettings = readSettings, loadProxies = loadCollectionProxies, proxyCooldowns } = {}) {
  const settings = await loadSettings();
  if (!settings.enabled) {
    // Keep queued work without consuming retries; any current crawl is allowed to finish.
    await worker.rateLimit(30_000);
    throw Worker.RateLimitError();
  }
  const { proxies } = await loadProxies();
  try {
    if (job.name === 'resolve-brand-request') return await processRequest(job.data.requestId, { resolveIdentity, proxies, proxyCooldowns });
    if (job.name === 'resolve-brand') return await resolveIdentity(job.data.url, { proxies, proxyCooldowns });
    return await crawl(job.data.brandId, { settings, proxies, onProgress: progress => job.updateProgress(progress),
    ...(proxyCooldowns ? { proxyCooldowns } : {}) }); }
  catch (error) {
    if (error.message === 'META_RATE_LIMITED') {
      const delayMs = rateLimitDelayMs(error);
      // The collector has already exhausted the configured proxies.
      await worker.rateLimit(delayMs);
      console.warn('[ad-library] configured routes exhausted; retry in seconds', Math.ceil(delayMs / 1000));
      throw Worker.RateLimitError();
    }
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const concurrency = Number(process.env.ADLIB_WORKER_CONCURRENCY || 1);
  if (process.env.ADLIB_SCRAPLING_ENABLED === 'true' && concurrency !== 1)
    throw new Error('SCRAPLING_REQUIRES_SINGLE_CRAWL_WORKER');
  const redis = commandsRedis();
  const proxyCooldowns = new RedisProxyCooldowns(redis);
  const worker = new Worker('ad-library-crawls', job => processCrawlJob(job, worker, { proxyCooldowns }), {
    connection: redisConnection(), concurrency,
    limiter: { max: 1, duration: 1000 },
  });
  const stopHeartbeat = startHeartbeat('worker', redis);
  worker.on('completed', (job, result) => console.log('[ad-library] complete', job.data.brandId, result.adsSeen));
  worker.on('failed', (job, error) => console.error('[ad-library] failed', job?.data?.brandId, error.message));
  const close = () => { stopHeartbeat(); worker.close().finally(() => process.exit(0)); };
  process.on('SIGINT', close);
  process.on('SIGTERM', close);
}
