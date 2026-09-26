// Operator-only import of a previously completed public collection. No web endpoint.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { serviceClient } from '../api/_lib/auth.js';
import { crawlBrand } from '../services/ad-library/worker.mjs';

const [path, companyId] = process.argv.slice(2);
assert.ok(path && companyId, 'Usage: node scripts/ad-library-import-capture.mjs CAPTURE_JSON COMPANY_ID');
const capture = JSON.parse(await readFile(path, 'utf8'));
assert.equal(capture.complete, true);
assert.match(capture.metaPageId, /^\d{5,25}$/);
assert.ok(Number.isFinite(Date.parse(capture.observedAt)) && Date.parse(capture.observedAt) <= Date.now());
assert.ok(Array.isArray(capture.ads) && capture.ads.length > 0);
for (const ad of capture.ads) {
  assert.match(ad.source_ad_id, /^\d+$/);
  assert.equal(ad.content_hash, createHash('sha256').update(JSON.stringify(ad.version)).digest('hex'));
}
const client = serviceClient();
const data = result => { if (result.error) throw new Error('CAPTURE_DATABASE_ERROR'); return result.data; };
data(await client.from('companies').select('id').eq('id', companyId).single());
data(await client.from('ad_library_brands').upsert({ source: 'meta_web', meta_page_id: capture.metaPageId,
  country: 'ALL', name: capture.ads[0].page_name || `Página ${capture.metaPageId}`,
  next_crawl_at: new Date(Date.now() + 6 * 3600_000).toISOString(),
}, { onConflict: 'source,meta_page_id,country', ignoreDuplicates: true }));
const brand = data(await client.from('ad_library_brands').select('*').eq('source', 'meta_web').eq('meta_page_id', capture.metaPageId).eq('country', 'ALL').single());
assert.ok(!brand.last_complete_scan_at || Date.parse(brand.last_complete_scan_at) <= Date.parse(capture.observedAt), 'Capture is older than the saved collection');
data(await client.from('ad_library_follows').upsert({ company_id: companyId, brand_id: brand.id, active: true }, { onConflict: 'company_id,brand_id' }));
const result = await crawlBrand(brand.id, { client, observedAt: capture.observedAt, collectionMethod: 'stored_capture',
  collectorFactory: () => ({ async *pages() {
    for (let offset = 0; offset < capture.ads.length; offset += 20) yield { ads: capture.ads.slice(offset, offset + 20) };
  } }),
});
data(await client.from('ad_library_brands').update({ next_crawl_at: new Date(Date.now() + 6 * 3600_000).toISOString() }).eq('id', brand.id));
console.log(JSON.stringify({ imported: 'stored_capture', observedAt: capture.observedAt, brandId: brand.id, ...result }));
// The one-off command owns the queue connections and can exit after all jobs were acknowledged.
process.exit(0);
