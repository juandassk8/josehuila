import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serviceClient } from '../../api/_lib/auth.js';
import { createMediaStorage } from '../../api/_lib/adLibrary/storage.js';

const run = promisify(execFile);
const data = response => { if (response.error) throw new Error('PREVIEW_DATABASE_ERROR'); return response.data; };

export async function renderPreview(buffer) {
  const directory = await mkdtemp(join(tmpdir(), 'adlib-preview-'));
  try {
    const source = join(directory, 'input'), target = join(directory, 'poster.jpg');
    await writeFile(source, buffer);
    const { stdout } = await run('ffprobe', ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height:format=duration', '-of', 'json', source], { timeout: 20_000, maxBuffer: 64 * 1024 });
    const probe = JSON.parse(stdout), stream = probe.streams?.[0];
    if (!stream?.width || !stream.height || stream.width * stream.height > 40_000_000) throw new Error('PREVIEW_DIMENSIONS_INVALID');
    await run('ffmpeg', ['-v', 'error', '-nostdin', '-threads', '1', '-protocol_whitelist', 'file,pipe', '-i', source,
      '-map', '0:v:0', '-frames:v', '1', '-vf', 'scale=540:-2', '-threads', '1', '-q:v', '4', '-y', target], { timeout: 30_000, maxBuffer: 64 * 1024 });
    const duration = Number(probe.format?.duration);
    return { buffer: await readFile(target), width: stream.width, height: stream.height,
      duration: Number.isFinite(duration) && duration > 0 ? duration : null };
  } finally { await rm(directory, { recursive: true, force: true }); }
}

export async function createPreview(sha256, { client = serviceClient(), storageFactory = createMediaStorage, render = renderPreview } = {}) {
  if (!/^[a-f0-9]{64}$/.test(sha256 || '')) throw new Error('PREVIEW_HASH_INVALID');
  const media = data(await client.from('ad_library_media').select('sha256,object_key,mime_type,poster_object_key').eq('sha256', sha256).maybeSingle());
  if (!media || media.poster_object_key || !media.mime_type.startsWith('video/')) return { skipped: true };
  const storage = storageFactory();
  try {
    const preview = await render(await storage.read(media.object_key));
    const saved = await storage.put(preview.buffer, 'image/jpeg');
    data(await client.from('ad_library_media').update({ poster_object_key: saved.objectKey,
      width: preview.width, height: preview.height, duration_seconds: preview.duration }).eq('sha256', sha256));
    return { generated: true };
  } finally { storage.close(); }
}
