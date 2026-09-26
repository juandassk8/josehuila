import { describe, expect, it, vi } from 'vitest';
import { detectMediaType, downloadCreative } from './media.js';
import { mediaSource } from './metaWeb.js';

describe('creative downloads', () => {
  it('rejects HTML masquerading as an image', async () => {
    const asset = mediaSource('https://scontent.xx.fbcdn.net/photo.jpg', 'image');
    await expect(downloadCreative(asset, { fetchImpl: async () => new Response('<html>error page</html>', { headers: { 'content-type': 'image/jpeg' } }) })).rejects.toThrow('MEDIA_TYPE_INVALID');
  });
  it('stops oversized downloads', async () => {
    const asset = mediaSource('https://video.xx.fbcdn.net/movie.mp4', 'video');
    await expect(downloadCreative(asset, { maxBytes: 10, fetchImpl: async () => new Response(Buffer.alloc(11)) })).rejects.toThrow('archivo demasiado grande');
  });
  it('rejects untrusted hosts before network access', async () => {
    const fetchImpl = vi.fn();
    await expect(downloadCreative({ url: 'https://127.0.0.1/private', kind: 'video' }, { fetchImpl })).rejects.toThrow('MEDIA_SOURCE_INVALID');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('recognizes MP4 and PNG signatures', () => {
    expect(detectMediaType(Buffer.from('0000ftypisom00000000'))).toBe('video/mp4');
    expect(detectMediaType(Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]))).toBe('image/png');
  });
});
