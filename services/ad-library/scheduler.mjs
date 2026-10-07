import { serviceClient } from '../../api/_lib/auth.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { commandsRedis, crawlQueue, enqueueBrand } from '../../api/_lib/adLibrary/queue.js';
import { readSettings } from '../../api/_lib/adminOperations/settings.js';
import { startHeartbeat } from './adminHeartbeat.mjs';
import { scheduleBrandRequests } from '../../api/_lib/adLibrary/brandRequests.js';

function data(response) {
  if (response.error) throw new Error(response.error.message || 'DATABASE_ERROR');
  return response.data;
}

export async function scheduleDueBrands(client = serviceClient(), { loadSettings = () => readSettings(client), enqueue = enqueueBrand, scheduleRequests = scheduleBrandRequests } = {}) {
  if (!(await loadSettings()).enabled) return 0;
  const due = data(await client.rpc('ad_library_due_brands'));
  for (const brand of due) await enqueue(brand.id);
  return due.length + await scheduleRequests(client);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { console.log('[ad-library] scheduled', await scheduleDueBrands()); }
    catch (error) { console.error('[ad-library] scheduler', error.message); }
    finally { running = false; }
  };
  await tick();
  const timer = setInterval(tick, 5 * 60_000);
  const stopHeartbeat = startHeartbeat('scheduler', commandsRedis());
  const close = () => { stopHeartbeat(); clearInterval(timer); crawlQueue().close().finally(() => process.exit(0)); };
  process.on('SIGINT', close);
  process.on('SIGTERM', close);
}
