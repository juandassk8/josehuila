import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Queue, QueueEvents, Worker } from 'bullmq';
import { redisConnection } from '../api/_lib/adLibrary/queue.js';

const name = `ad-library-smoke-${randomUUID()}`;
const queue = new Queue(name, { connection: redisConnection({ producer: true }) });
const events = new QueueEvents(name, { connection: redisConnection() });
let calls = 0;
const worker = new Worker(name, () => { if (++calls === 1) throw new Error('EXPECTED_RETRY'); return { processed: true }; }, { connection: redisConnection() });
for (const emitter of [queue, events, worker]) emitter.on('error', error => console.error('QUEUE_SMOKE_ERROR', error.name));
try {
  await Promise.all([queue.waitUntilReady(), events.waitUntilReady(), worker.waitUntilReady()]);
  const options = { jobId: 'same-test-job', attempts: 2, backoff: { type: 'exponential', delay: 50 } };
  const job = await queue.add('test', {}, options);
  const duplicate = await queue.add('test', {}, options);
  assert.equal(job.id, duplicate.id);
  assert.deepEqual(await job.waitUntilFinished(events, 10000), { processed: true });
  assert.equal(calls, 2);
  console.log('Redis queue OK: unique job, worker processing, retry with backoff');
} finally {
  await worker.close(); await events.close();
  await queue.obliterate({ force: true }); await queue.close();
}
