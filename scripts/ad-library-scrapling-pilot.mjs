// Read-only collector pilot: no DB connection, crawl reconciliation or media jobs.
import { parseArgs } from 'node:util';
import { writeFile } from 'node:fs/promises';
import Redis from 'ioredis';
import { ScraplingCollector } from '../api/_lib/adLibrary/scrapling.js';
import { RedisProxyCooldowns } from '../api/_lib/adLibrary/proxyCooldowns.js';
import { assertCompletion } from '../api/_lib/adLibrary/collectorContract.js';

const { values } = parseArgs({ options: { page: { type: 'string' }, output: { type: 'string' } } });
if (!/^\d{5,25}$/.test(values.page || '')) throw new Error('META_INVALID_BRAND');
const redis = new Redis(process.env.ADLIB_REDIS_URL || 'redis://127.0.0.1:6379', { maxRetriesPerRequest: 1 });
const brand = { source: 'meta_web', meta_page_id: values.page, country: 'ALL' };
const ads = new Map(); let completion, pages = 0;
const started = Date.now();
try {
  const collector = new ScraplingCollector({ maxPages: 100, maxDurationMs: 180000, idleTimeoutMs: 30000,
    proxyCooldowns: new RedisProxyCooldowns(redis) });
  for await (const page of collector.pages(brand)) {
    if (page.completion) completion = page.completion;
    else { pages++; for (const ad of page.ads) ads.set(ad.source_ad_id, ad); }
  }
  assertCompletion(completion, brand);
  const result = { pageId: values.page, complete: true, engine: completion.engine, pages,
    ads: ads.size, withMedia: [...ads.values()].filter(ad => ad.media?.length).length, elapsedMs: Date.now() - started };
  if (values.output) await writeFile(values.output, JSON.stringify({ ...result, evidence: completion, items: [...ads.values()] }), { mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(JSON.stringify({ pageId: values.page, complete: false, pages, ads: ads.size,
    error: /^[A-Z0-9_]{1,80}$/.test(error.message || '') ? error.message : 'PILOT_FAILED',
    retryAfterMs: error.retryAfterMs || null, elapsedMs: Date.now() - started }));
  process.exitCode = 1;
} finally { await redis.quit(); }
