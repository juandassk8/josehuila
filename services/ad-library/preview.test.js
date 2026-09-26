import { expect, it, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import { createPreview } from './preview.mjs';

function database(media) {
  const update = vi.fn();
  return { update, from: () => {
    const query = { select: () => query, eq: () => query,
      update: value => { update(value); return query; },
      maybeSingle: async () => ({ data: media }), then: resolve => Promise.resolve({ data: [] }).then(resolve) };
    return query;
  } };
}
it('does not download or render an existing shared thumbnail twice', async () => {
  const storageFactory = vi.fn();
  expect(await createPreview('a'.repeat(64), { client: database({ mime_type: 'video/mp4', poster_object_key: 'poster' }), storageFactory })).toEqual({ skipped: true });
  expect(storageFactory).not.toHaveBeenCalled();
});
it('closes storage and leaves the original metadata intact when decoding fails', async () => {
  const client = database({ mime_type: 'video/mp4', object_key: 'original' });
  const close = vi.fn(), put = vi.fn();
  await expect(createPreview('a'.repeat(64), { client, storageFactory: () => ({ read: async () => Buffer.from('bad'), put, close }), render: async () => { throw new Error('invalid'); } })).rejects.toThrow();
  expect(close).toHaveBeenCalled(); expect(put).not.toHaveBeenCalled(); expect(client.update).not.toHaveBeenCalled();
});
