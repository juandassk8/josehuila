import { serviceClient } from '../api/_lib/auth.js';
import { enqueuePreview, getMediaQueue } from '../api/_lib/adLibrary/queue.js';
const client = serviceClient();
let cursor = '', count = 0;
try {
  while (true) {
    const response = await client.from('ad_library_media').select('sha256').like('mime_type', 'video/%')
      .is('poster_object_key', null).gt('sha256', cursor).order('sha256').limit(100);
    if (response.error) throw new Error('PREVIEW_BACKFILL_READ_FAILED');
    if (!response.data.length) break;
    for (const item of response.data) { await enqueuePreview(item.sha256); count++; }
    cursor = response.data.at(-1).sha256;
  }
  console.log(JSON.stringify({ previewsQueued: count }));
} finally { await getMediaQueue().close(); }
