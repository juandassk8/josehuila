import { randomUUID } from 'node:crypto';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { R2MediaStorage } from '../api/_lib/adLibrary/storage.js';

const storage = new R2MediaStorage();
const expected = Buffer.from(`inforce-r2-smoke-${randomUUID()}`);
let objectKey;

try {
  const saved = await storage.put(expected, 'text/plain');
  objectKey = saved.objectKey;
  const signedUrl = await storage.signedRead(objectKey);
  const response = await fetch(signedUrl, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error('R2_SIGNED_READ_FAILED');
  const actual = Buffer.from(await response.arrayBuffer());
  if (!actual.equals(expected)) throw new Error('R2_READ_MISMATCH');

  console.log('Inforce R2 upload and private read OK');
} catch (error) {
  console.error(`R2 smoke test failed: ${error?.name || 'UNKNOWN'} (HTTP ${error?.$metadata?.httpStatusCode || 'unknown'})`);
  process.exitCode = 1;
} finally {
  if (objectKey) {
    try {
      await storage.client.send(new DeleteObjectCommand({ Bucket: storage.bucket, Key: objectKey }));
      console.log('R2 test object removed');
    } catch (error) {
      console.error(`R2 test cleanup failed: ${error?.name || 'UNKNOWN'}`);
      process.exitCode = 1;
    }
  }
  storage.client.destroy();
}
