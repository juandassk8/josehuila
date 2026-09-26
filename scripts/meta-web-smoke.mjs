import { writeFile } from 'node:fs/promises';
import { MetaWebCollector } from '../api/_lib/adLibrary/metaWeb.js';

const collector = new MetaWebCollector({ maxDurationMs: 180_000 });
const ads = new Map();
try {
  for await (const page of collector.pages({ meta_page_id: process.env.ADLIB_TEST_PAGE_ID || '646751588512715', country: 'ALL' })) {
    for (const ad of page.ads) ads.set(ad.source_ad_id, ad);
    console.log(JSON.stringify({ page: page.page, ads: page.ads.length, unique: ads.size }));
  }
  if (process.env.ADLIB_SMOKE_OUTPUT) await writeFile(process.env.ADLIB_SMOKE_OUTPUT, JSON.stringify([...ads.values()]));
  console.log(JSON.stringify({ complete: true, ads: ads.size, withMedia: [...ads.values()].filter(ad => ad.media.length).length }));
} catch (error) {
  console.error(JSON.stringify({ complete: false, partialAds: ads.size, error: error.message?.split('\n')[0].replace(/https?:\/\/\S+/g, '[url]') || error.name }));
  process.exitCode = 1;
}
