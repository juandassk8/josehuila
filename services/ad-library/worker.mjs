import { Worker } from 'bullmq';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serviceClient } from '../../api/_lib/auth.js';
import { createCollector } from '../../api/_lib/adLibrary/collectors.js';
import { nextCrawlDelayMs } from '../../api/_lib/adLibrary/core.js';
import { redisConnection, enqueueMedia } from '../../api/_lib/adLibrary/queue.js';
import { rateLimitDelayMs, metaRateLimitError } from '../../api/_lib/adLibrary/retryPolicy.js';

function data(response) {
  if (response.error) throw new Error(response.error.message || 'DATABASE_ERROR');
  return response.data;
}

function plusMs(ms) { return new Date(Date.now() + ms).toISOString(); }

export async function crawlBrand(brandId, { client = serviceClient(), collectorFactory = createCollector, mediaEnqueue = enqueueMedia, onProgress = async () => {}, observedAt, collectionMethod = 'live' } = {}) {
  const brand = data(await client.from('ad_library_brands').select('*').eq('id', brandId).single());
  const active = data(await client.from('ad_library_follows').select('id').eq('brand_id', brandId).eq('active', true).limit(1));
  if (!active.length) return { skipped: true };
  const run = data(await client.from('ad_library_crawl_runs').insert({ brand_id: brandId, collection_method: collectionMethod, ...(observedAt ? { started_at: observedAt } : {}) })
    .select('id,started_at').single());
  const startedAt = run.started_at;
  let pagesSeen = 0, adsSeen = 0, newAds = 0, changedAds = 0;
  try {
    await onProgress({ pagesSeen, adsSeen });
    const collector = collectorFactory(brand.source);
    for await (const page of collector.pages(brand)) {
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
      if (brand.name.startsWith('Página ') && ads[0]?.page_name) {
        data(await client.from('ad_library_brands').update({ name: ads[0].page_name }).eq('id', brandId));
        brand.name = ads[0].page_name;
      }
    }
    data(await client.rpc('ad_library_finish_crawl', {
      p_brand_id: brandId, p_started_at: startedAt, p_complete: true,
    }));
    const now = new Date().toISOString();
    data(await client.from('ad_library_crawl_runs').update({
      finished_at: now, status: 'complete', complete_scan: true,
      pages_seen: pagesSeen, ads_seen: adsSeen, new_ads: newAds, changed_ads: changedAds,
    }).eq('id', run.id));
    data(await client.from('ad_library_brands').update({
      last_crawl_at: now, last_crawl_status: 'complete',
      next_crawl_at: plusMs(nextCrawlDelayMs({ newAds, changedAds })),
    }).eq('id', brandId));
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
      next_crawl_at: plusMs(code === 'META_RATE_LIMITED' ? rateLimitDelayMs(error) : nextCrawlDelayMs({ failed: true })),
    }).eq('id', brandId);
    if (code === 'META_RATE_LIMITED') throw metaRateLimitError(rateLimitDelayMs(error));
    throw new Error(code, { cause: error });
  }
}

export async function processCrawlJob(job, worker, { crawl = crawlBrand } = {}) {
  try { return await crawl(job.data.brandId, { onProgress: progress => job.updateProgress(progress) }); }
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
  const worker = new Worker('ad-library-crawls', job => processCrawlJob(job, worker), {
    connection: redisConnection(), concurrency: Number(process.env.ADLIB_WORKER_CONCURRENCY || 1),
    limiter: { max: 1, duration: 1000 },
  });
  worker.on('completed', (job, result) => console.log('[ad-library] complete', job.data.brandId, result.adsSeen));
  worker.on('failed', (job, error) => console.error('[ad-library] failed', job?.data?.brandId, error.message));
  const close = () => worker.close().finally(() => process.exit(0));
  process.on('SIGINT', close);
  process.on('SIGTERM', close);
}
