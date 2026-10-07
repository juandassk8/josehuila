import { afterEach, describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
import { S3MediaStorage } from './storage.js';

const stores = [];
function storage(send) {
  const instance = new S3MediaStorage({ endpoint:'https://storage.example.com', accessKeyId:'test', secretAccessKey:'test', bucket:'test', timeoutMs:30 });
  instance.client.send = send;
  stores.push(instance);
  return instance;
}
afterEach(() => { for (const instance of stores.splice(0)) instance.close(); });
const stalled = (_command, { abortSignal }) => new Promise((_, reject) => {
  abortSignal.addEventListener('abort', () => reject(new Error('Aborted')), { once:true });
});

describe('bounded media storage', () => {
  it('aborts a stalled existence check without starting an upload', async () => {
    const send=vi.fn(stalled), store=storage(send);
    await expect(store.put(Buffer.from('video'), 'video/mp4')).rejects.toThrow('MEDIA_STORAGE_TIMEOUT');
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][1].abortSignal.aborted).toBe(true);
  });
  it('aborts a stalled upload, then reuses the object on retry if the server stored it', async () => {
    const send=vi.fn().mockRejectedValueOnce({name:'NotFound'}).mockImplementationOnce(stalled).mockResolvedValueOnce({});
    const store=storage(send), bytes=Buffer.from('video');
    await expect(store.put(bytes,'video/mp4')).rejects.toThrow('MEDIA_STORAGE_TIMEOUT');
    expect(send.mock.calls[1][1].abortSignal.aborted).toBe(true);
    const result=await store.put(bytes,'video/mp4');
    expect(result.bytes).toBe(bytes.length);
    expect(send.mock.calls.map(([command])=>command.constructor.name)).toEqual(['HeadObjectCommand','PutObjectCommand','HeadObjectCommand']);
    expect(send.mock.calls[2][0].input.Key).toBe(result.objectKey);
  });
  it('does not upload after an authorization or storage service error', async () => {
    const send=vi.fn().mockRejectedValue({name:'AccessDenied',$metadata:{httpStatusCode:403}});
    await expect(storage(send).put(Buffer.from('video'),'video/mp4')).rejects.toMatchObject({name:'AccessDenied'});
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('uses one deadline for HEAD and PUT and clears it after successful writes', async () => {
    const send=vi.fn().mockRejectedValueOnce({$metadata:{httpStatusCode:404}}).mockResolvedValueOnce({});
    const result=await storage(send).put(Buffer.from('image'),'image/jpeg');
    expect(result.mimeType).toBe('image/jpeg');
    const signal=send.mock.calls[0][1].abortSignal;
    expect(send.mock.calls[1][1].abortSignal).toBe(signal);
    await new Promise(resolve=>setTimeout(resolve,50));
    expect(signal.aborted).toBe(false);
  });
  it('cancels a stalled response body after GET headers already arrived', async () => {
    const body=new Readable({read(){}});
    await expect(storage(vi.fn().mockResolvedValue({Body:body,ContentLength:100})).read('video')).rejects.toThrow('MEDIA_STORAGE_TIMEOUT');
    expect(body.destroyed).toBe(true);
  });
});
