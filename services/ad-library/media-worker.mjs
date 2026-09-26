import { Worker } from 'bullmq';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serviceClient } from '../../api/_lib/auth.js';
import { createMediaStorage } from '../../api/_lib/adLibrary/storage.js';
import { downloadCreative } from '../../api/_lib/adLibrary/media.js';
import { enqueuePreview, redisConnection } from '../../api/_lib/adLibrary/queue.js';
import { createPreview } from './preview.mjs';

function data(response) { if (response.error) throw new Error('MEDIA_DATABASE_ERROR'); return response.data; }

export async function archiveMedia({ adId, contentHash, assets }, { client = serviceClient(), storageFactory = createMediaStorage, download = downloadCreative, previewEnqueue = enqueuePreview } = {}) {
  const ad = data(await client.from('ad_library_ads').select('content_hash,media_content_hash').eq('id', adId).maybeSingle());
  if (!ad || ad.content_hash !== contentHash || ad.media_content_hash === contentHash) return { skipped: true };
  const storage = storageFactory();
  const attached = [];
  try {
    for (const [position, asset] of assets.slice(0, 20).entries()) {
      const existing = data(await client.from('ad_library_media_sources').select('sha256').eq('source_key', asset.sourceKey).maybeSingle());
      let sha256 = existing?.sha256;
      if (!sha256) {
        const { buffer, mimeType } = await download(asset);
        const saved = await storage.put(buffer, mimeType);
        sha256 = saved.sha256;
        data(await client.from('ad_library_media').upsert({ sha256, object_key: saved.objectKey, mime_type: mimeType, bytes: saved.bytes }, { onConflict: 'sha256', ignoreDuplicates: true }));
        data(await client.from('ad_library_media_sources').upsert({ source_key: asset.sourceKey, sha256 }, { onConflict: 'source_key', ignoreDuplicates: true }));
      }
      attached.push({ sha256, kind: asset.kind, position });
    }
    data(await client.rpc('ad_library_set_media', { p_ad_id: adId, p_content_hash: contentHash, p_assets: attached }));
    for (const media of attached.filter(item => item.kind === 'video')) {
      try { await previewEnqueue(media.sha256); }
      catch { console.error('[ad-library-preview] queue unavailable'); }
    }
    return { archived: attached.length };
  } catch (error) {
    const code = /^[A-Z0-9_]{1,80}$/.test(error?.message || '') ? error.message : 'MEDIA_ARCHIVE_FAILED';
    await client.from('ad_library_ads').update({ media_error: code }).eq('id', adId).eq('content_hash', contentHash);
    throw new Error(code);
  } finally { storage.close?.(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const worker = new Worker('ad-library-media', job => job.name === 'preview-media' ? createPreview(job.data.sha256) : archiveMedia(job.data), { connection: redisConnection(), concurrency: 1 });
  worker.on('completed', job => console.log('[ad-library-media] complete', job.data.adId || job.data.sha256));
  worker.on('failed', (job, error) => console.error('[ad-library-media] failed', job?.id, error.name));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => worker.close().finally(() => process.exit(0)));
}
