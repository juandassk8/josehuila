import { serviceClient } from '../../api/_lib/auth.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crawlQueue, enqueueBrand } from '../../api/_lib/adLibrary/queue.js';

function data(response) {
  if (response.error) throw new Error(response.error.message || 'DATABASE_ERROR');
  return response.data;
}

export async function scheduleDueBrands(client = serviceClient()) {
  const due = data(await client.rpc('ad_library_due_brands'));
  for (const brand of due) await enqueueBrand(brand.id);
  return due.length;
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
  const close = () => { clearInterval(timer); crawlQueue().close().finally(() => process.exit(0)); };
  process.on('SIGINT', close);
  process.on('SIGTERM', close);
}
