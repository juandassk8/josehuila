import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3001';
const serviceKey = process.env.BACKEND_SERVICE_KEY;
if (!serviceKey) throw new Error('SERVICE_KEY_MISSING');
const suffix = randomUUID();
const companies = ['a', 'b'].map(letter => `adlib-smoke-${letter}-${suffix}`);
const users = [];
let brandId;
const call = async (path, { method = 'GET', token = serviceKey, body } = {}) => {
  const response = await fetch(base + path, { method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}), Prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined });
  const data = await response.json().catch(() => null);
  if (response.status >= 500) throw new Error(`SMOKE_SERVER_${response.status}`);
  return { status: response.status, data };
};
const rest = (path, options) => call('/backend/rest/v1/' + path, options);
const rpc = async (name, body) => { const result = await rest('rpc/' + name, { method: 'POST', body }); assert.equal(result.status, 200, JSON.stringify(result.data)); return result.data; };
try {
  const sessions = [];
  for (let i = 0; i < 2; i++) {
    const email = `adlib-${i}-${suffix}@example.invalid`, password = randomUUID() + 'aA1!';
    const created = await call('/backend/auth/v1/admin/users', { method: 'POST', body: { email, password } });
    assert.equal(created.status, 200); users.push(created.data.user.id);
    const login = await call('/backend/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
    assert.equal(login.status, 200); sessions.push(login.data.access_token);
    assert.equal((await rest('companies', { method: 'POST', body: { id: companies[i], name: 'Ad library integration test', slug: companies[i], owner_user_id: users[i] } })).status, 201);
  }
  const pageId = '99999' + Date.now();
  const brand = await rest('ad_library_brands', { method: 'POST', body: { meta_page_id: pageId, source: 'meta_web', country: 'ALL', name: 'Integration fixture', next_crawl_at: '2100-01-01T00:00:00Z', last_complete_scan_at: '2020-01-01T00:00:00Z' } });
  assert.equal(brand.status, 201); brandId = brand.data[0].id;
  assert.equal((await rest('ad_library_follows', { method: 'POST', body: { company_id: companies[0], brand_id: brandId } })).status, 201);
  const collection = await call(`/api/ad-library?action=collection&companyId=${companies[0]}&brandId=${brandId}`, { token: sessions[0] });
  assert.equal(collection.status, 200); assert.equal(collection.data.hasCompleteScan, true); assert.equal(collection.data.queued, false);
  assert.equal((await call(`/api/ad-library?action=collection&companyId=${companies[0]}&brandId=${brandId}`, { token: sessions[1] })).status, 403);
  assert.equal((await call(`/api/ad-library?action=collection&companyId=${companies[1]}&brandId=${brandId}`, { token: sessions[1] })).status, 403);
  const first = '2020-01-01T00:00:00Z', seen = '2020-01-02T00:00:00Z';
  const row = { source_ad_id: pageId, source_url: 'https://www.facebook.com/ads/library/?id=' + pageId, status: 'active', content_hash: 'a'.repeat(64), body: 'First copy' };
  await rpc('ad_library_upsert_ads', { p_brand_id: brandId, p_started_at: first, p_ads: [row] });
  const initial = (await rest(`ad_library_ads?brand_id=eq.${brandId}&select=first_seen,last_changed_at`)).data[0];
  assert.equal(Date.parse(initial.last_changed_at), Date.parse(first));
  await rpc('ad_library_upsert_ads', { p_brand_id: brandId, p_started_at: seen, p_ads: [{ ...row, body: 'Updated copy', content_hash: 'b'.repeat(64) }] });
  const readAd = async () => (await rest(`ad_library_ads?brand_id=eq.${brandId}&source_ad_id=eq.${pageId}&select=id,first_seen,last_seen,last_changed_at,status,missing_complete_scans`)).data[0];
  const saved = await readAd(); assert.equal(Date.parse(saved.first_seen), Date.parse(first)); assert.equal(Date.parse(saved.last_seen), Date.parse(seen));
  assert.equal((await rest('ad_library_versions', { method: 'POST', body: [
    { ad_id: saved.id, content_hash: 'a'.repeat(64), content: { body: 'First copy', status: 'active' }, captured_at: first },
    { ad_id: saved.id, content_hash: 'b'.repeat(64), content: { body: 'Updated copy', status: 'active' }, captured_at: seen },
  ] })).status, 201);
  assert.equal(Date.parse(saved.last_changed_at), Date.parse(seen));
  await rpc('ad_library_upsert_ads', { p_brand_id: brandId, p_started_at: first, p_ads: [row] });
  assert.equal(Date.parse((await readAd()).last_seen), Date.parse(seen));
  assert.equal((await rest(`ad_library_ads?brand_id=eq.${brandId}`, { token: sessions[0] })).data.length, 0);
  const visible = await call(`/api/ad-library?action=ads&companyId=${companies[0]}&brandId=${brandId}`, { token: sessions[0] });
  assert.equal(visible.status, 200); assert.equal(visible.data.ads.length, 1);
  assert.equal((await call(`/api/ad-library?action=ads&companyId=${companies[0]}&brandId=${brandId}`, { token: sessions[1] })).status, 403);
  assert.equal((await call(`/api/ad-library?action=ads&companyId=${companies[1]}&brandId=${brandId}`, { token: sessions[1] })).status, 403);
  assert.equal((await call(`/api/ad-library?action=insights&companyId=${companies[0]}&brandId=${brandId}`, { token: sessions[1] })).status, 403);
  await rpc('ad_library_upsert_ads', { p_brand_id: brandId, p_started_at: seen, p_ads: [
    { ...row, source_ad_id: pageId + '1', content_hash: 'c'.repeat(64), body: 'Offer 50% today', source_start_at: '2019-12-01T00:00:00Z', landing_url: 'https://example.invalid/product?utm_source=one' },
    { ...row, source_ad_id: pageId + '2', content_hash: 'd'.repeat(64), body: 'Offer 50% today', source_start_at: '2019-12-02T00:00:00Z', landing_url: 'https://example.invalid/product?utm_source=two' },
  ] });
  const workspace = async (action, extra = {}, user = 0) => call('/api/ad-library?' + new URLSearchParams({ action, companyId: companies[0], brandId, ...extra }), { token: sessions[user] });
  const insight = await workspace('insights');
  assert.equal(insight.status, 200); assert.equal(insight.data.total, 3);
  assert.equal(insight.data.destinations[0].total, 2); assert.equal(insight.data.hooks[0].total, 2);
  assert.equal((await workspace('insights', { search: '50%' })).data.total, 2);
  assert.equal((await workspace('insights', { search: '_' })).data.total, 0, 'Search wildcards must be literal');
  const longPage = (await workspace('ads', { sort: 'longest', limit: '1' })).data;
  assert.equal(longPage.ads[0].source_ad_id, pageId + '1');
  const longNext = (await workspace('ads', { sort: 'longest', limit: '1', cursor: longPage.nextCursor })).data;
  assert.equal(longNext.ads[0].source_ad_id, pageId + '2');
  assert.equal((await workspace('ads', { sort: 'newest', cursor: longPage.nextCursor })).status, 400);
  assert.equal((await workspace('ads', { groupType: 'landing', groupValue: 'https://example.invalid/product' })).data.ads.length, 2);
  const save = await call('/api/ad-library', { method: 'POST', token: sessions[0], body: { action: 'save', companyId: companies[0], adId: saved.id, saved: true } });
  assert.equal(save.status, 200);
  assert.equal((await workspace('insights', { saved: 'true' })).data.total, 1);
  assert.equal((await workspace('history', { adId: saved.id })).data.versions.length, 2);
  assert.equal((await rest('ad_library_saves', { token: sessions[0] })).data.length, 0, 'Saved selections are not public tables');
  assert.equal((await rest('ad_library_catalog', { token: sessions[0] })).data.length, 0, 'View must preserve catalog RLS');
  const directRpc = await rest('rpc/ad_library_workspace_insights', { method: 'POST', token: sessions[0], body: { p_company: companies[0], p_user: users[0] } });
  assert.equal(directRpc.status, 403, 'Workspace functions must be service-only');
  assert.equal((await rest('team_members', { method: 'POST', body: { id: users[1], email: `adlib-1-${suffix}@example.invalid`, name: 'Temporary editor', role: 'editor' } })).status, 201);
  assert.equal((await call(`/api/ad-library?action=brands&companyId=${companies[0]}`, { token: sessions[1] })).status, 403);
  await rest(`team_members?id=eq.${users[1]}`, { method: 'DELETE' });
  for (let i = 0; i < 2; i++) {
    const follow = await call('/api/ad-library', { method: 'POST', token: sessions[i], body: { action: 'follow', companyId: companies[i], pageId, country: i ? 'CO' : 'US' } });
    assert.equal(follow.status, 200); assert.equal(follow.data.brand.id, brandId); assert.equal(follow.data.cached, true); assert.equal(follow.data.queued, false);
  }
  const otherSaved = await call('/api/ad-library?' + new URLSearchParams({ action: 'insights', companyId: companies[1], saved: 'true' }), { token: sessions[1] });
  assert.equal(otherSaved.data.total, 0);
  assert.equal((await rest('company_team_members', { method: 'POST', body: { company_id: companies[0], name: 'Second reader', email: `adlib-1-${suffix}@example.invalid`, auth_user_id: users[1], roles: ['editor'] } })).status, 201);
  assert.equal((await workspace('insights', { saved: 'true' }, 1)).data.total, 0, 'Saved selections must also be private between users of the same company');
  await rpc('ad_library_finish_crawl', { p_brand_id: brandId, p_started_at: '2020-01-03T00:00:00Z', p_complete: false });
  assert.equal((await readAd()).missing_complete_scans, 0);
  for (let i = 0; i < 2; i++) await rpc('ad_library_finish_crawl', { p_brand_id: brandId, p_started_at: '2020-01-03T00:00:00Z', p_complete: true });
  assert.equal((await readAd()).missing_complete_scans, 1);
  await rpc('ad_library_finish_crawl', { p_brand_id: brandId, p_started_at: '2020-01-04T00:00:00Z', p_complete: true });
  assert.equal((await readAd()).status, 'not_observed');
  assert.equal(await rpc('ad_library_set_media', { p_ad_id: saved.id, p_content_hash: row.content_hash, p_assets: [] }), false);
  console.log('Ad library integration OK: tenant isolation, private catalog/view/RPC, aggregate filters, literal search, keyset duration sort, private saves, version history, shared brand without recrawl, partial scans, retry idempotency, obsolete media');
} finally {
  for (const id of companies) await rest(`companies?id=eq.${id}`, { method: 'DELETE' });
  if (brandId) await rest(`ad_library_brands?id=eq.${brandId}`, { method: 'DELETE' });
  for (const id of users) {
    await rest(`team_members?id=eq.${id}`, { method: 'DELETE' });
    await call(`/backend/auth/v1/admin/users/${id}`, { method: 'DELETE' });
  }
  console.log('Ad library integration fixtures removed');
}
