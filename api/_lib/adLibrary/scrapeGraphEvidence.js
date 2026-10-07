import { createHash } from 'node:crypto';
import { normalizeMetaWebAd } from './metaWeb.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const VIDEO_ERROR = "Sorry, we're having trouble playing this video.";
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Visible evidence is accepted only with an independently confirmed fanpage URL.
// A search term, advertiser name or approximate result count is not identity proof.
export function canonicalPageUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port
      || !/^(?:www\.|web\.|m\.)?facebook\.com$/.test(url.hostname)) return null;
    const path = url.pathname.replace(/\/+$/, '').toLowerCase();
    if (path === '/profile.php' && /^\d{5,25}$/.test(url.searchParams.get('id') || '')) return `https://www.facebook.com/profile.php?id=${url.searchParams.get('id')}`;
    if (!/^\/[a-z0-9.]+$/.test(path) || /^\/(ads|login|help|groups|watch|reel|share|search|checkpoint)$/.test(path)) return null;
    return `https://www.facebook.com${path}`;
  } catch { return null; }
}

function sourceDate(card) {
  const match = card.match(/^Started running on ([A-Z][a-z]{2}) (\d{1,2}), (\d{4})(?:[ \t]*\*[ \t]*Total active time[^\n]*)?[ \t]*$/m);
  if (!match) return null;
  const month = MONTHS.indexOf(match[1]), day = Number(match[2]), year = Number(match[3]);
  if (month < 0 || year < 2000 || year > 2100 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month, day));
  return date.getUTCMonth() === month && date.getUTCDate() === day ? date.getTime() / 1000 : null;
}

function links(text) {
  return [...text.matchAll(/(?<!!)\[([^\]\n]*)\]\((https:\/\/[^\s)]+)\)/g)]
    .map(match => ({ text: match[1], url: match[2].replaceAll('&amp;', '&'), index: match.index }));
}

export function inspectVisibleEvidence(documents, pageId, { pageUrl } = {}) {
  const expected = canonicalPageUrl(pageUrl);
  if (!expected || !/^\d{5,25}$/.test(pageId)) throw new Error('SGAI_PAGE_IDENTITY_REQUIRED');
  const ads = new Map();
  let rejectedCards = 0, reportedTotal = null;
  for (const original of documents) {
    const markdown = original.replaceAll('\r', '').replace(/[\u200b-\u200d\ufeff]/g, '');
    // Split at every visible ID, including unsupported cards: never borrow the
    // next card's images or identity when a status/date variant is unrecognized.
    const markers = [...markdown.matchAll(/^Library ID:[ \t]*(\d{5,25})[ \t]*$/gm)];
    if (!markers.length) continue;
    const header = markdown.slice(0, markers[0].index);
    if (!links(header).some(link => canonicalPageUrl(link.url) === expected)) throw new Error('META_PAGE_MISMATCH');
    const total = header.match(/^~?([\d,]+) results\s*$/m);
    if (total) reportedTotal = Number(total[1].replaceAll(',', ''));
    for (const [index, marker] of markers.entries()) {
      const card = markdown.slice(marker.index + marker[0].length, markers[index + 1]?.index ?? markdown.length);
      const prefix = markdown.slice(Math.max(0, marker.index - 160), marker.index);
      const status = prefix.match(/(?:^|\n)(Active|Inactive)(?:Low impression count)?\s*$/);
      const sponsored = /^\*+Sponsored\*+\s*$/m.exec(card);
      const startDate = sourceDate(card);
      const identity = sponsored && links(card.slice(0, sponsored.index)).find(link => canonicalPageUrl(link.url) === expected);
      if (!status || !sponsored || !identity?.text.trim() || !startDate) { rejectedCards++; continue; }
      const content = card.slice(sponsored.index + sponsored[0].length).trim();
      const destination = [...content.matchAll(/\]\((https:\/\/[^\s)]+)\)/g)]
        .map(match => ({ url: match[1].replaceAll('&amp;', '&'), index: match.index, end: match.index + match[0].length })).find(link => {
        try { const u = new URL(link.url); return u.hostname === 'l.facebook.com' && u.pathname === '/l.php'; } catch { return false; }
      });
      const creative = destination ? content.slice(0, destination.end) : content;
      const videoUnavailable = creative.includes(VIDEO_ERROR);
      const imageMatches = [...creative.matchAll(/!\[[^\]\n]*\]\((https:\/\/[^\s)]+)\)/g)];
      // Avatars occur BEFORE Sponsored. Only creative images after the copy qualify.
      const images = imageMatches.map(match => ({ original_image_url: match[1].replaceAll('&amp;', '&') }));
      const ends = [content.indexOf(VIDEO_ERROR), imageMatches[0]?.index, destination?.index]
        .filter(value => Number.isInteger(value) && value >= 0);
      const body = content.slice(0, ends.length ? Math.min(...ends) : content.length)
        .replace(/\[\s*$/, '').trim();
      // Refuse cards without a recognizable creative boundary; never import page chrome as copy.
      if (!ends.length || !body) { rejectedCards++; continue; }
      const ad = normalizeMetaWebAd({ ad_archive_id: marker[1], page_id: pageId,
        page_name: identity.text.trim(), is_active: status[1] === 'Active', start_date: startDate,
        snapshot: { body: { text: body }, images, link_url: destination?.url } }, pageId);
      if (!ad) { rejectedCards++; continue; }
      if (videoUnavailable) {
        ad.media_type = 'video'; ad.version.media_type = 'video';
        ad.content_hash = hash(ad.version);
      }
      ad.evidence = { kind: 'visible_meta_card', pageUrl: expected, datePrecision: 'day',
        mediaUnavailable: videoUnavailable, bodyMayBeTruncated: true };
      ads.set(ad.source_ad_id, ad);
    }
  }
  return { ads: [...ads.values()], rejectedCards, reportedTotal,
    missingVideo: [...ads.values()].filter(ad => ad.evidence.mediaUnavailable).length };
}
