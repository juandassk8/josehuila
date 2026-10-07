import { describe, expect, it } from 'vitest';
import { MetaOfficialCollector } from './metaOfficial.js';

const brand = { meta_page_id: '646751588512715', country: 'GB' };

describe('MetaOfficialCollector', () => {
  it('paginates with cursors while keeping the token out of the URL', async () => {
    const urls = [];
    const collector = new MetaOfficialCollector({ token: 'SECRET', maxPages: 3,
      fetchImpl: async (url, options) => {
        urls.push(String(url));
        expect(options.headers.Authorization).toBe('Bearer SECRET');
        return { ok: true, json: async () => urls.length === 1
          ? { data: [{ id: '123', page_id: brand.meta_page_id }], paging: { next: 'https://example.com/?access_token=SECRET', cursors: { after: 'CURSOR' } } }
          : { data: [], paging: {} } };
      } });
    const pages = [];
    for await (const page of collector.pages(brand)) pages.push(page);
    expect(pages.filter(page => !page.completion)).toHaveLength(2);
    expect(pages.at(-1).completion).toMatchObject({ engine: 'meta_official', evidence: 'pagination_end' });
    expect(urls).toHaveLength(2);
    expect(urls[1]).toContain('after=CURSOR');
    expect(urls.join(' ')).not.toContain('SECRET');
  });

  it('rejects truncated scans so absence detection cannot run', async () => {
    const collector = new MetaOfficialCollector({ token: 'TOKEN', maxPages: 1,
      fetchImpl: async () => ({ ok: true, json: async () => ({ data: [], paging: { next: 'more', cursors: { after: 'NEXT' } } }) }) });
    const consume = async () => {
      for await (const page of collector.pages(brand)) void page;
    };
    await expect(consume()).rejects.toThrow('META_PAGE_LIMIT');
  });
});
