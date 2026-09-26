import { describe, expect, it, vi } from 'vitest';
import { buildAdLibraryRequest, probeAdLibrary } from '../scripts/meta-ad-library-probe.mjs';

describe('Meta Ad Library probe', () => {
  it('builds an exact page query for the requested country', () => {
    const url = buildAdLibraryRequest({ pageId: '123456789012345678', country: 'us' });
    expect(url.hostname).toBe('graph.facebook.com');
    expect(url.searchParams.get('ad_reached_countries')).toBe('["US"]');
    expect(url.searchParams.get('search_page_ids')).toBe('[123456789012345678]');
    expect(url.searchParams.get('limit')).toBe('5');
    expect(url.searchParams.has('access_token')).toBe(false);
  });

  it('never returns token-bearing snapshot or pagination URLs', async () => {
    const token = 'sensitive-test-token';
    const fetchImpl = vi.fn(async () => Response.json({
      data: [{ id: '42', page_id: '123', page_name: 'Marca', ad_snapshot_url: `https://meta.example/?access_token=${token}` }],
      paging: { next: `https://graph.facebook.com/ads_archive?access_token=${token}` },
    }));
    const result = await probeAdLibrary({ token, pageId: '123', country: 'CO', fetchImpl });
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${token}`);
    expect(fetchImpl.mock.calls[0][0].href).not.toContain(token);
    expect(result).toMatchObject({ count: 1, has_more: true, ads: [{ id: '42', page_id: '123' }] });
    expect(JSON.stringify(result)).not.toContain(token);
    expect(JSON.stringify(result)).not.toContain('ad_snapshot_url');
  });

  it('does not print a token repeated in an API error', async () => {
    const token = 'sensitive-test-token';
    const fetchImpl = async () => Response.json({
      error: { type: 'OAuthException', code: 190, message: `Invalid token ${token}` },
    }, { status: 400 });
    await expect(probeAdLibrary({ token, search: 'Colombia', fetchImpl }))
      .rejects.toThrow('Meta rechazó la consulta (HTTP 400; OAuthException 190).');
  });
});
