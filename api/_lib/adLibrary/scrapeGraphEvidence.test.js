import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { canonicalPageUrl, inspectVisibleEvidence } from './scrapeGraphEvidence.js';
import { inspectPilotResponse } from './scrapeGraphPilot.js';

const pageId = '123456', pageUrl = 'https://facebook.com/examplebrand/';
const header = '[Example](https://facebook.com/examplebrand)\n\n~44 results\n\n';
const card = ({ id = '987654321', video = false, date = 'Oct 4, 2026', identity = 'examplebrand' } = {}) => `Active

Library ID: ${id}

Started running on ${date}

Platforms

See ad details

![Example](https://scontent.xx.fbcdn.net/avatar.jpg)

[Example](https://www.facebook.com/${identity}/)

**Sponsored******

Texto real del anuncio.\nSegunda línea.

${video ? "Sorry, we're having trouble playing this video." : '[![](https://scontent.xx.fbcdn.net/creative.jpg)Compra ahora](https://l.facebook.com/l.php?u=https%3A%2F%2Fexample.com%2Fproduct)' }
`;

describe('visible Meta evidence from ScrapeGraph', () => {
  it('extracts real cards, excludes avatars, preserves dates and decodes nested CTA destinations', () => {
    const result = inspectVisibleEvidence([header + card() + '\n' + card({ id: '987654322', video: true })], pageId, { pageUrl });
    expect(result.ads).toHaveLength(2);
    expect(result).toMatchObject({ reportedTotal: 44, missingVideo: 1, rejectedCards: 0 });
    expect(result.ads[0]).toMatchObject({ page_name: 'Example', source_ad_id: '987654321',
      source_start_at: '2026-10-04T00:00:00.000Z', landing_url: 'https://example.com/product',
      body: 'Texto real del anuncio.\nSegunda línea.', media_type: 'image' });
    expect(result.ads[0].media.map(item => item.url)).toEqual(['https://scontent.xx.fbcdn.net/creative.jpg']);
    expect(result.ads[1]).toMatchObject({ media_type: 'video', media: [], evidence: { mediaUnavailable: true } });
    for (const ad of result.ads) expect(ad.content_hash).toBe(createHash('sha256').update(JSON.stringify(ad.version)).digest('hex'));
  });
  it('refuses name-only matches or the wrong page and never guesses an identity', () => {
    expect(() => inspectVisibleEvidence([header + card()], pageId)).toThrow('SGAI_PAGE_IDENTITY_REQUIRED');
    expect(() => inspectVisibleEvidence([header.replace('facebook.com/examplebrand', 'facebook.com/anotherbrand') + card()], pageId, { pageUrl })).toThrow('META_PAGE_MISMATCH');
    expect(inspectVisibleEvidence([header + card({ identity: 'anotherbrand' })], pageId, { pageUrl })).toMatchObject({ ads: [], rejectedCards: 1 });
    for (const url of ['http://facebook.com/examplebrand', 'https://facebook.com.evil.test/examplebrand', 'https://facebook.com/login', 'https://user:secret@facebook.com/examplebrand']) expect(canonicalPageUrl(url)).toBeNull();
  });
  it('does not import invalid dates, arbitrary text, page chrome or hostile media', () => {
    expect(inspectVisibleEvidence([header + card({ date: 'Feb 30, 2026' })], pageId, { pageUrl })).toMatchObject({ ads: [], rejectedCards: 1 });
    expect(inspectVisibleEvidence(['There are 44 winning ads'], pageId, { pageUrl }).ads).toEqual([]);
    const unsafe = card().replace('scontent.xx.fbcdn.net/creative.jpg', 'localhost/private');
    expect(inspectVisibleEvidence([header + unsafe], pageId, { pageUrl }).ads[0].media).toEqual([]);
  });
  it('deduplicates cards but never treats the reported count as proof of completeness', () => {
    const result = inspectPilotResponse({ id: 'real-request', results: { markdown: { data: [header + card(), header + card()] } } }, pageId, { pageUrl });
    expect(result).toMatchObject({ complete: false, coverage: 'partial', evidenceKind: 'visible_meta_cards', withMedia: 1, reportedTotal: 44 });
    expect(result.ads).toHaveLength(1);
  });
  it('handles low-impression and active-time labels without mixing neighboring creative media', () => {
    const video = card({ video: true }).replace('Active\n', 'ActiveLow impression count\n');
    const image = card({ id: '987654322', date: 'Oct 6, 2026 * Total active time 19 hrs' });
    const result = inspectVisibleEvidence([header + video + '\n' + image], pageId, { pageUrl });
    expect(result).toMatchObject({ rejectedCards: 0, missingVideo: 1 });
    expect(result.ads).toHaveLength(2);
    expect(result.ads[0].media).toEqual([]);
    expect(result.ads[1].media).toHaveLength(1);
  });
  it('does not merge an unsupported middle card into either neighbor', () => {
    const unsupported = card({ id: '987654322' }).replace('Active\n', 'New label\n');
    const result = inspectVisibleEvidence([header + card({ video: true }) + '\n' + unsupported + '\n' + card({ id: '987654323', video: true })], pageId, { pageUrl });
    expect(result.rejectedCards).toBe(1);
    expect(result.ads.map(ad => ad.source_ad_id)).toEqual(['987654321', '987654323']);
    expect(result.ads.every(ad => !ad.media.length)).toBe(true);
  });
});
