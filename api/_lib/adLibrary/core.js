import { createHash } from 'node:crypto';

export function parseMetaPageId(value) {
  const raw = String(value || '').trim();
  if (/^[0-9]{5,25}$/.test(raw)) return raw;
  let url;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== 'https:' || !/(^|\.)facebook\.com$/i.test(url.hostname)) return null;
  // profile.php?id puede no ser el ID usado por Ad Library: exigir el vínculo exacto.
  const id = url.searchParams.get('view_all_page_id');
  return /^[0-9]{5,25}$/.test(id || '') ? id : null;
}

function firstText(value) {
  if (Array.isArray(value)) return value.find(item => typeof item === 'string' && item.trim())?.trim() || null;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isoDate(value) {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

export function normalizeMetaAd(raw, pageId) {
  if (!raw || !/^[0-9]+$/.test(String(raw.id || ''))) return null;
  if (raw.page_id && String(raw.page_id) !== String(pageId)) return null;
  const id = String(raw.id);
  const stop = isoDate(raw.ad_delivery_stop_time);
  const ad = {
    source_ad_id: id,
    page_name: firstText(raw.page_name),
    body: firstText(raw.ad_creative_bodies),
    title: firstText(raw.ad_creative_link_titles),
    caption: firstText(raw.ad_creative_link_captions),
    cta: null,
    landing_url: null,
    media_type: null,
    source_url: `https://www.facebook.com/ads/library/?id=${encodeURIComponent(id)}`,
    source_start_at: isoDate(raw.ad_delivery_start_time),
    source_stop_at: stop,
    status: stop && Date.parse(stop) <= Date.now() ? 'inactive' : 'active',
  };
  // El snapshot de Meta puede contener access_token: jamás se conserva.
  const version = {
    body: ad.body, title: ad.title, caption: ad.caption, cta: ad.cta,
    landing_url: ad.landing_url, media_type: ad.media_type,
    source_start_at: ad.source_start_at, source_stop_at: ad.source_stop_at,
    status: ad.status,
  };
  return { ...ad, content_hash: createHash('sha256').update(JSON.stringify(version)).digest('hex'), version };
}

export function nextCrawlDelayMs({ newAds = 0, changedAds = 0, failed = false } = {}) {
  if (failed) return 6 * 60 * 60 * 1000;
  return newAds + changedAds > 0 ? 6 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
}
