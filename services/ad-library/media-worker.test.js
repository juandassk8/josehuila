import { expect, it, vi } from 'vitest';
import { archiveMedia } from './media-worker.mjs';

function db(ad, source) {
  const rpc = vi.fn(async () => ({ data: true }));
  const from = table => {
    const query = { select: () => query, eq: () => query,
      maybeSingle: async () => ({ data: table === 'ad_library_ads' ? ad : source }) };
    return query;
  };
  return { from, rpc };
}

it('discards obsolete media jobs before downloading or overwriting the current creative', async () => {
  const client = db({ content_hash: 'newer' });
  const storageFactory = vi.fn();
  expect(await archiveMedia({ adId: 'one', contentHash: 'older', assets: [] }, { client, storageFactory })).toEqual({ skipped: true });
  expect(storageFactory).not.toHaveBeenCalled();
  expect(client.rpc).not.toHaveBeenCalled();
});

it('reuses an archived source across ads without another download', async () => {
  const client = db({ content_hash: 'current' }, { sha256: 'existing' });
  const download = vi.fn();
  const close = vi.fn();
  await archiveMedia({ adId: 'one', contentHash: 'current', assets: [{ sourceKey: 'source', kind: 'video' }] }, { client, download, previewEnqueue: vi.fn(), storageFactory: () => ({ close }) });
  expect(download).not.toHaveBeenCalled();
  expect(client.rpc).toHaveBeenCalledWith('ad_library_set_media', { p_ad_id: 'one', p_content_hash: 'current', p_assets: [{ sha256: 'existing', kind: 'video', position: 0 }] });
  expect(close).toHaveBeenCalled();
});
