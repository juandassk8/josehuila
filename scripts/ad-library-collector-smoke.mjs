import { MetaOfficialCollector } from '../api/_lib/adLibrary/metaOfficial.js';

const pageId = process.argv[2] || '646751588512715';
const country = process.argv[3] || 'GB';
try {
  const collector = new MetaOfficialCollector({ maxPages: 1 });
  const iterator = collector.pages({ meta_page_id: pageId, country });
  const first = await iterator.next();
  await iterator.return();
  console.log(JSON.stringify({ pageId, country, adsOnFirstPage: first.value?.ads?.length || 0 }));
} catch (error) {
  console.error(`Collector failed: ${String(error.message || 'UNKNOWN').replace(/[^A-Z0-9_]/g, '')}`);
  process.exitCode = 1;
}
