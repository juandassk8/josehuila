// Explicit operator action; default is an offline preview and spends no API credits.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { inspectPilotResponse } from '../api/_lib/adLibrary/scrapeGraphPilot.js';
import { parseBrandInput } from '../api/_lib/adLibrary/brandIdentity.js';

const [path, requestId, companyId, mode] = process.argv.slice(2);
assert.ok(path && companyId && /^[a-f0-9-]{36}$/i.test(requestId || '') && (!mode || mode === '--execute'),
  'Usage: node scripts/ad-library-import-partial.mjs EVIDENCE_JSON REQUEST_ID COMPANY_ID [--execute]');
const raw = await readFile(path, 'utf8'), evidence = JSON.parse(raw);
assert.equal(parseBrandInput(evidence.request?.url).pageId, evidence.pageId);
assert.equal(new URL(evidence.request.url).searchParams.get('country'), 'ALL');
assert.ok(Number.isFinite(Date.parse(evidence.observedAt)) && Date.parse(evidence.observedAt) <= Date.now());
const result = inspectPilotResponse(evidence.payload, evidence.pageId, { pageUrl: evidence.pageUrl });
assert.ok(result.ads.length > 0 && result.coverage === 'partial' && result.complete === false);
const name = result.ads[0].page_name;
for (const ad of result.ads) {
  assert.equal(ad.page_name, name);
  assert.equal(ad.content_hash, createHash('sha256').update(JSON.stringify(ad.version)).digest('hex'));
}
if (!mode) {
  console.log(JSON.stringify({ preview: true, pageId: evidence.pageId, name, ads: result.ads.length,
    images: result.withMedia, videosWithoutFile: result.missingVideo, complete: false }));
} else {
  const { serviceClient } = await import('../api/_lib/auth.js');
  const { enqueueMedia, enqueueBrand } = await import('../api/_lib/adLibrary/queue.js');
  const client = serviceClient();
  const { data, error } = await client.rpc('ad_library_import_partial', {
    p_request: requestId, p_company: companyId, p_page: evidence.pageId, p_name: name,
    p_observed: evidence.observedAt, p_ads: result.ads, p_evidence: {
      sha256: createHash('sha256').update(raw).digest('hex'), pageUrl: evidence.pageUrl,
      requestId: result.requestId, kind: result.evidenceKind, reportedTotal: result.reportedTotal,
      missingVideo: result.missingVideo,
    },
  });
  if (error) throw Error('PARTIAL_IMPORT_FAILED', { cause: { code: error.code } });
  let queuedMedia = 0;
  for (const job of data.mediaJobs) { await enqueueMedia(job.adId, job.contentHash, job.media); queuedMedia++; }
  await enqueueBrand(data.brandId, { reason: 'first_import' });
  console.log(JSON.stringify({ brandId: data.brandId, newAds: data.newAds, queuedMedia, complete: false }));
  process.exit(0);
}
