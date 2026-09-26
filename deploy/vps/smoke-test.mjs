import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3001';
const key = process.env.BACKEND_SERVICE_KEY;
if (!key) throw new Error('BACKEND_SERVICE_KEY requerida');
const suffix = randomUUID(), password = randomUUID() + 'aA1!';
const users = [], companies = [`test-a-${suffix}`, `test-b-${suffix}`];
async function call(path, { method = 'GET', token, body, cookie, headers = {} } = {}) {
  const response = await fetch(base + '/backend/' + path, { method, headers: { ...headers, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
const rest = (path, options = {}) => call('rest/v1/' + path, options);
try {
  assert.equal((await rest('companies?select=id')).status, 401);
  for (let i = 0; i < 2; i++) {
    const email = `test-${i}-${suffix}@example.invalid`;
    const result = await call('auth/v1/admin/users', { method: 'POST', token: key, body: { email, password } });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    users.push(result.data.user);
  }
  const sessions = [];
  for (const user of users) {
    const r = await call('auth/v1/token?grant_type=password', { method: 'POST', body: { email: user.email, password } });
    assert.equal(r.status, 200, JSON.stringify(r.data)); sessions.push(r);
  }
  const token = sessions[0].data.access_token, cookie = sessions[0].cookie;
  assert.ok(cookie?.startsWith('inforce_refresh='));
  assert.equal((await call('auth/v1/token?grant_type=refresh_token', { method: 'POST', cookie, body: {} })).status, 200);
  assert.equal((await call('auth/v1/user', { token })).data.id, users[0].id);
  for (let i = 0; i < 2; i++) {
    const r = await rest('companies', { method: 'POST', token: key, body: { id: companies[i], name: 'Deployment test', slug: companies[i], owner_user_id: users[i].id } });
    assert.equal(r.status, 201, JSON.stringify(r.data));
  }
  const visible = await rest('companies?select=id', { token });
  assert.deepEqual(visible.data.map(c => c.id), [companies[0]]);
  const hidden = await rest(`companies?id=eq.${companies[1]}`, { method: 'PATCH', token, body: { name: 'Forbidden' }, headers: { Prefer: 'return=representation' } });
  assert.deepEqual(hidden.data, []);
  assert.equal((await rest('team_members', { method: 'POST', token, body: { id: users[0].id, name: 'Forbidden', email: users[0].email, role: 'admin' } })).status, 403);
  assert.equal((await rest('client_users', { method: 'POST', token, body: { user_id: users[0].id, company_id: companies[1] } })).status, 403);
  assert.equal((await rest('company_team_members', { method: 'POST', token, body: { company_id: companies[1], name: 'Forbidden', auth_user_id: users[0].id, is_owner: true } })).status, 403);
  assert.equal((await rest('team_members', { method: 'POST', token: key, body: { id: users[0].id, name: 'Test editor', email: users[0].email, role: 'editor' } })).status, 201);
  assert.equal((await rest(`team_members?id=eq.${users[0].id}`, { method: 'PATCH', token, body: { role: 'admin' } })).status, 403);
  assert.equal((await rest('rpc/task_session_totals', { method: 'POST', token, body: {} })).status, 200);
  const sseController = new AbortController();
  const sse = await fetch(base + '/backend/events', { headers: { Cookie: cookie }, signal: sseController.signal });
  assert.equal(sse.status, 200);
  const reader = sse.body.getReader(); await reader.read();
  await rest(`companies?id=eq.${companies[0]}`, { method: 'PATCH', token, body: { name: 'Updated by owner' } });
  const notification = await Promise.race([reader.read(), new Promise((_, reject) => { const t = setTimeout(() => reject(new Error('SSE timeout')), 5000); t.unref(); })]);
  assert.match(new TextDecoder().decode(notification.value), /companies/);
  sseController.abort();
  const filePath = `test-${suffix}.txt`;
  const uploaded = await fetch(base + '/backend/storage/v1/object/feedback-images/' + filePath, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' }, body: 'deployment smoke test' });
  assert.equal(uploaded.status, 200, await uploaded.text());
  const anonymousFile = await fetch(base + '/backend/storage/v1/object/public/feedback-images/' + filePath);
  assert.equal(anonymousFile.status, 401);
  const file = await fetch(base + '/backend/storage/v1/object/public/feedback-images/' + filePath, { headers: { Cookie: cookie } });
  assert.equal(await file.text(), 'deployment smoke test');
  assert.equal(file.headers.get('content-disposition'), 'attachment');
  assert.equal((await call('storage/v1/object/feedback-images', { method: 'DELETE', token, body: { prefixes: [filePath] } })).status, 200);
  assert.equal((await call('auth/v1/logout', { method: 'POST', token, cookie, body: {} })).status, 200);
  assert.equal((await call('auth/v1/user', { token })).status, 401);
  assert.equal((await call('auth/v1/token?grant_type=refresh_token', { method: 'POST', cookie, body: {} })).status, 401);
  assert.equal((await call(`auth/v1/admin/users/${users[1].id}`, { method: 'PUT', token: key, body: { password: randomUUID() } })).status, 200);
  assert.equal((await call('auth/v1/user', { token: sessions[1].data.access_token })).status, 401);
  console.log('PASS: login, refresh, tenant isolation, denied privilege escalation, SSE, files and logout revocation');
} finally {
  for (const id of companies) await rest(`companies?id=eq.${id}`, { method: 'DELETE', token: key });
  for (const user of users) {
    await rest(`team_members?id=eq.${user.id}`, { method: 'DELETE', token: key });
    await call(`auth/v1/admin/users/${user.id}`, { method: 'DELETE', token: key });
  }
}
