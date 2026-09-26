import { describe, it, expect, vi } from 'vitest';
import { receiveImage, MAX_IMAGE_BYTES } from './files.js';

const file = { file_id: 'file-example', download_url: 'https://files.oaiusercontent.com/example.png' };
const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
describe('receive image files', () => {
  it('uses actual bytes rather than the claimed type or filename', async () => {
    const fetcher = vi.fn(async () => new Response(png));
    const result = await receiveImage({ ...file, mime_type: 'text/html', file_name: '../../outside.html' }, fetcher);
    expect(result.mimeType).toBe('image/png'); expect(result.buffer.equals(png)).toBe(true);
  });
  it.each(['file:///etc/passwd','http://example.com/a','https://user:pass@example.com/a','not-a-url'])('rejects unsafe URL form %s', async url => {
    const fetcher = vi.fn();
    await expect(receiveImage({ ...file, download_url: url }, fetcher)).rejects.toMatchObject({ status: 400 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects SVG/HTML even when the extension is PNG', async () => {
    await expect(receiveImage(file, async () => new Response('<svg onload="alert(1)"/>'))).rejects.toMatchObject({ status: 415 });
  });
  it('cancels declared oversized files without buffering', async () => {
    const response = new Response(png, { headers: { 'content-length': String(MAX_IMAGE_BYTES + 1) } });
    const cancel = vi.spyOn(response.body, 'cancel');
    await expect(receiveImage(file, async () => response)).rejects.toMatchObject({ status: 413 });
    expect(cancel).toHaveBeenCalled();
  });
  it('explains expired signed URLs', async () => {
    await expect(receiveImage(file, async () => new Response('', { status: 403 }))).rejects.toMatchObject({ status: 422 });
  });
});
