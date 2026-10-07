// A normal generator return is not evidence that the source's inventory ended.
export function collectionScope(brand) {
  return { source: brand.source || 'meta_web', pageId: brand.meta_page_id,
    country: brand.country || 'ALL', activeStatus: brand.source === 'meta_official' ? 'all' : brand.last_complete_scan_at ? 'active' : 'all' };
}

export function completedCollection(brand, engine, evidence = 'pagination_end') {
  return { ads: [], completion: { ...collectionScope(brand), engine, evidence } };
}

export function assertCompletion(completion, brand, collectionMethod = 'live') {
  const expected = collectionScope(brand);
  if (!completion || Object.entries(expected).some(([key, value]) => completion[key] !== value)
    || !['meta_web', 'meta_official', 'scrapling', 'stored_capture'].includes(completion.engine)
    || completion.evidence !== (collectionMethod === 'stored_capture' ? 'stored_capture' : 'pagination_end')
    || (collectionMethod === 'live' && completion.engine === 'stored_capture')) throw new Error('COLLECTION_INCOMPLETE');
}

// These are browser/data-delivery failures, not rate limits, authorization,
// schema changes, exhausted proxies or failures in our database/media workers.
const RECOVERABLE = new Set(['META_NO_SEARCH_DATA', 'META_PAGINATION_STALLED', 'META_CRAWL_TIMEOUT', 'COLLECTION_INCOMPLETE']);

export class CollectorCoordinator {
  constructor(collectors, { onAttempt = async () => {} } = {}) {
    this.collectors = collectors;
    this.onAttempt = onAttempt;
  }

  async *pages(brand) {
    const delivered = new Set();
    for (let index = 0; index < this.collectors.length; index++) {
      const { engine, create } = this.collectors[index];
      const attempt = { engine, status: 'running', started_at: new Date().toISOString(), pages: 0, ads: 0 };
      await this.onAttempt({ ...attempt });
      let completion;
      try {
        for await (const page of create().pages(brand)) {
          if (completion) throw new Error('COLLECTION_PROTOCOL_INVALID');
          if (!Array.isArray(page?.ads)) throw new Error('COLLECTION_PROTOCOL_INVALID');
          if (page.completion) {
            if (page.ads.length) throw new Error('COLLECTION_PROTOCOL_INVALID');
            assertCompletion(page.completion, brand);
            if (page.completion.engine !== engine) throw new Error('COLLECTION_PROTOCOL_INVALID');
            completion = page.completion;
            continue;
          }
          attempt.pages++;
          attempt.ads += page.ads.length;
          const ads = page.ads.filter(ad => {
            const key = JSON.stringify([ad.source_ad_id, ad.content_hash, ad.status]);
            if (delivered.has(key)) return false;
            delivered.add(key);
            return true;
          });
          yield { ...page, ads };
        }
        assertCompletion(completion, brand);
      } catch (error) {
        await this.onAttempt({ ...attempt, status: 'failed', finished_at: new Date().toISOString(),
          error_code: /^[A-Z0-9_]{1,80}$/.test(error.message || '') ? error.message : 'COLLECTOR_FAILED' });
        if (!RECOVERABLE.has(error.message) || index === this.collectors.length - 1) throw error;
        continue;
      }
      await this.onAttempt({ ...attempt, status: 'complete', finished_at: new Date().toISOString() });
      // Only publish completion after the iterator has ended AND closed resources.
      yield { ads: [], completion };
      return;
    }
    throw new Error('COLLECTION_INCOMPLETE');
  }
}
