import { normalizeMetaAd } from './core.js';

const FIELDS = [
  'id', 'page_id', 'page_name', 'ad_creative_bodies', 'ad_creative_link_titles',
  'ad_creative_link_captions', 'ad_delivery_start_time', 'ad_delivery_stop_time',
  'publisher_platforms',
].join(',');

// Contrato de Collector: páginas de anuncios normalizables. Solo se considera
// completo el recorrido si la paginación terminó sin errores ni límites locales.
export class MetaOfficialCollector {
  constructor({ token = process.env.META_AD_LIBRARY_TOKEN,
    version = process.env.META_GRAPH_VERSION || 'v26.0', fetchImpl = fetch, maxPages = 500 } = {}) {
    this.token = token;
    if (!/^v\d+\.\d+$/.test(version)) throw new Error('META_GRAPH_VERSION_INVALID');
    this.version = version;
    this.fetchImpl = fetchImpl;
    this.maxPages = maxPages;
  }

  async *pages(brand) {
    if (!this.token) throw new Error('META_TOKEN_MISSING');
    let after = null;
    for (let page = 0; page < this.maxPages; page++) {
      const url = new URL(`https://graph.facebook.com/${this.version}/ads_archive`);
      url.searchParams.set('search_page_ids', JSON.stringify([brand.meta_page_id]));
      url.searchParams.set('ad_reached_countries', JSON.stringify([brand.country || 'ALL']));
      url.searchParams.set('ad_type', 'ALL');
      url.searchParams.set('ad_active_status', 'ALL');
      url.searchParams.set('fields', FIELDS);
      url.searchParams.set('limit', '100');
      if (after) url.searchParams.set('after', after);
      const response = await this.fetchImpl(url, {
        headers: { Authorization: `Bearer ${this.token}` },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        // No registrar cuerpo, URL, cursor ni snapshot: pueden incluir el token.
        throw new Error(`META_HTTP_${response.status}`);
      }
      const payload = await response.json();
      if (!Array.isArray(payload?.data)) throw new Error('META_INVALID_RESPONSE');
      const ads = payload.data.map(raw => normalizeMetaAd(raw, brand.meta_page_id)).filter(Boolean);
      yield { ads, page: page + 1 };
      if (!payload.paging?.next) return;
      const nextAfter = payload.paging?.cursors?.after;
      if (!nextAfter || nextAfter === after) throw new Error('META_PAGINATION_INVALID');
      after = nextAfter;
    }
    throw new Error('META_PAGE_LIMIT');
  }
}
