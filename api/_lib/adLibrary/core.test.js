import { describe, expect, it } from 'vitest';
import { normalizeMetaAd, parseMetaPageId, nextCrawlDelayMs } from './core.js';

describe('Ad Library normalizer', () => {
  it('accepts the exact library page ID, not a profile URL ID', () => {
    expect(parseMetaPageId('https://web.facebook.com/ads/library/?view_all_page_id=646751588512715')).toBe('646751588512715');
    expect(parseMetaPageId('https://web.facebook.com/profile.php?id=61574986254717')).toBeNull();
    expect(parseMetaPageId('646751588512715')).toBe('646751588512715');
  });

  it('never saves token-bearing snapshot URLs and hashes meaningful changes', () => {
    const raw = { id: '123456', page_id: '646751588512715', page_name: 'Bonapet',
      ad_creative_bodies: ['Primera versión'], ad_delivery_start_time: '2026-09-01',
      ad_snapshot_url: 'https://www.facebook.com/ad?access_token=SECRET' };
    const first = normalizeMetaAd(raw, raw.page_id);
    expect(JSON.stringify(first)).not.toContain('SECRET');
    expect(first.source_url).toBe('https://www.facebook.com/ads/library/?id=123456');
    expect(normalizeMetaAd({ ...raw, ad_creative_bodies: ['Nueva versión'] }, raw.page_id).content_hash)
      .not.toBe(first.content_hash);
    expect(normalizeMetaAd({ ...raw, ad_delivery_stop_time: '2026-09-15' }, raw.page_id).content_hash)
      .not.toBe(first.content_hash);
    expect(normalizeMetaAd({ ...raw, page_id: '99999' }, raw.page_id)).toBeNull();
  });

  it('schedules changed brands sooner', () => {
    expect(nextCrawlDelayMs({ newAds: 1 })).toBeLessThan(nextCrawlDelayMs());
  });
});
