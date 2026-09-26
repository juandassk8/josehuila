import { createHash } from 'node:crypto';
import { S3Client, HeadObjectCommand, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Storage contract: put(bytes, mimeType), read(key, maxBytes), signedRead(key, seconds), close().
export class S3MediaStorage {
  constructor({ endpoint, region = 'auto', accessKeyId, secretAccessKey, bucket } = {}) {
    if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) throw new Error('STORAGE_NOT_CONFIGURED');
    this.bucket = bucket;
    this.client = new S3Client({
      region, endpoint,
      credentials: { accessKeyId, secretAccessKey }, forcePathStyle: true,
    });
  }

  async put(buffer, mimeType) {
    const sha256 = createHash('sha256').update(buffer).digest('hex');
    const objectKey = `ad-library/sha256/${sha256.slice(0, 2)}/${sha256}`;
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey }));
    } catch (error) {
      if (error?.$metadata?.httpStatusCode !== 404 && error?.name !== 'NotFound') throw error;
      await this.client.send(new PutObjectCommand({
        Bucket: this.bucket, Key: objectKey, Body: buffer, ContentType: mimeType,
      }));
    }
    return { sha256, objectKey, mimeType, bytes: buffer.length };
  }

  async signedRead(objectKey, expiresIn = 600) {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }), { expiresIn });
  }

  async read(objectKey, maxBytes = 100 * 1024 * 1024) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);
    let body;
    try {
      const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }), { abortSignal: controller.signal });
      body = response.Body;
      if (response.ContentLength > maxBytes) throw new Error('MEDIA_TOO_LARGE');
      const chunks = []; let size = 0;
      for await (const chunk of body) {
        size += chunk.length;
        if (size > maxBytes) throw new Error('MEDIA_TOO_LARGE');
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    } finally { clearTimeout(timer); body?.destroy?.(); }
  }

  close() { this.client.destroy(); }
}

export class R2MediaStorage extends S3MediaStorage {
  constructor({ accountId = process.env.R2_ACCOUNT_ID, accessKeyId = process.env.R2_ACCESS_KEY_ID,
    secretAccessKey = process.env.R2_SECRET_ACCESS_KEY, bucket = process.env.R2_BUCKET } = {}) {
    if (!accountId) throw new Error('R2_NOT_CONFIGURED');
    super({ endpoint: `https://${accountId}.r2.cloudflarestorage.com`, accessKeyId, secretAccessKey, bucket });
  }
}

export function createMediaStorage() {
  if (!process.env.MEDIA_STORAGE_PROVIDER || process.env.MEDIA_STORAGE_PROVIDER === 'r2') return new R2MediaStorage();
  if (process.env.MEDIA_STORAGE_PROVIDER === 's3') return new S3MediaStorage({
    endpoint: process.env.S3_ENDPOINT, region: process.env.S3_REGION || 'auto',
    bucket: process.env.S3_BUCKET, accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  });
  throw new Error('UNSUPPORTED_STORAGE');
}
