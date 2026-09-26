// Verifica en el VPS que los ataques reproducidos por diagnostic.mjs ya no funcionan.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

if (process.env.SECURITY_AUDIT_ALLOW_FIXTURES !== '1') throw new Error('Se requiere SECURITY_AUDIT_ALLOW_FIXTURES=1');
const env = Object.fromEntries((await readFile('/etc/inforce/api.env', 'utf8')).split('\n').filter(x => x.includes('=')).map(x => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)]));
const base = 'http://127.0.0.1:3001';
const service = env.BACKEND_SERVICE_KEY;
const run = randomUUID();
const users = [];
const companies = [`security-fixed-a-${run}`, `security-fixed-b-${run}`];
let spaceId;
let taskId;

async function request(path, method = 'GET', body, token = service, cookie = '') {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data, headers: response.headers };
}
const rest = (path, method = 'GET', body, token = service) => request(`/backend/rest/v1/${path}`, method, body, token);
const login = (email, password) => request('/backend/auth/v1/token?grant_type=password', 'POST', { email, password }, null);
const record = (name, result) => console.log(JSON.stringify({ name, ...result }));

try {
  for (const role of ['admin', 'editor', 'owner', 'victim']) {
    const password = randomUUID();
    const email = `security-fixed-${role}-${run}@example.invalid`;
    const created = await request('/backend/auth/v1/admin/users', 'POST', { email, password });
    assert.equal(created.status, 200);
    const user = { ...created.data.user, password, role };
    users.push(user);
    if (['admin', 'editor'].includes(role)) {
      assert.equal((await rest('team_members', 'POST', { id: user.id, email, name: 'Security regression', role, active: true })).status, 201);
    }
    const session = await login(email, password);
    assert.equal(session.status, 200);
    user.token = session.data.access_token;
  }

  const [admin, editor, owner, victim] = users;
  for (const [index, user] of [[0, owner], [1, victim]]) {
    assert.equal((await rest('companies', 'POST', { id: companies[index], slug: companies[index], name: 'Security regression', owner_user_id: user.id })).status, 201);
  }

  const forgedByOwner = await rest('company_team_members', 'POST', {
    company_id: companies[0], name: 'Forged identity', email: `unrelated-${run}@example.invalid`, auth_user_id: admin.id,
  }, owner.token);
  record('owner_cannot_forge_auth_link', { status: forgedByOwner.status });
  assert.equal(forgedByOwner.status, 403);

  const forgedByService = await rest('company_team_members', 'POST', {
    company_id: companies[0], name: 'Legacy forged identity', email: `unrelated-${run}@example.invalid`, auth_user_id: admin.id,
  });
  assert.equal(forgedByService.status, 201);
  const ownerReset = await request('/api/admin-create-client-user', 'POST', { action: 'reset-member', memberId: forgedByService.data[0].id }, owner.token);
  record('owner_cannot_reset_existing_identity', { status: ownerReset.status });
  assert.equal(ownerReset.status, 403);

  const editorReset = await request('/api/admin-create-client-user', 'POST', { companyId: companies[1], newPassword: randomUUID() }, editor.token);
  record('editor_cannot_reset_other_company', { status: editorReset.status });
  assert.equal(editorReset.status, 403);

  const editorOnboarding = await request('/api/onboarding-form', 'POST', { action: 'usuarios', companyId: companies[1] }, editor.token);
  record('editor_cannot_read_onboarding_users', { status: editorOnboarding.status });
  assert.equal(editorOnboarding.status, 403);

  const space = await rest('spaces', 'POST', { name: 'Security regression', visibility: 'private', owner_id: editor.id });
  spaceId = space.data[0].id;
  const task = await rest('tasks', 'POST', { title: 'Security regression', space_id: spaceId, created_by: editor.id });
  taskId = task.data[0].id;
  const deactivated = await rest(`team_members?id=eq.${editor.id}`, 'PATCH', { active: false });
  record('deactivation_persisted', { status: deactivated.status, active: deactivated.data?.[0]?.active });
  assert.equal(deactivated.status, 200);
  assert.equal(deactivated.data?.[0]?.active, false);
  const inactiveLogin = await login(editor.email, editor.password);
  record('inactive_member_login_rejected', { status: inactiveLogin.status });
  assert.equal(inactiveLogin.status, 401);
  const inactiveWrite = await rest(`tasks?id=eq.${taskId}`, 'PATCH', { title: 'Must not change' }, editor.token);
  record('inactive_member_session_rejected', { status: inactiveWrite.status });
  assert.equal(inactiveWrite.status, 401);
  await rest(`team_members?id=eq.${editor.id}`, 'PATCH', { active: true });

  const localUrl = `${base}/healthz`;
  const ssrf = await request('/api/rehost-covers', 'POST', { urls: [localUrl] }, admin.token);
  record('loopback_rehosting_blocked', { status: ssrf.status, published: Boolean(ssrf.data?.covers?.[localUrl]) });
  assert.equal(ssrf.status, 200);
  assert.equal(Boolean(ssrf.data?.covers?.[localUrl]), false);
} finally {
  if (taskId) await rest(`tasks?id=eq.${taskId}`, 'DELETE');
  if (spaceId) await rest(`spaces?id=eq.${spaceId}`, 'DELETE');
  for (const company of companies) {
    await rest(`company_team_members?company_id=eq.${company}`, 'DELETE');
    await rest(`client_users?company_id=eq.${company}`, 'DELETE');
    await rest(`companies?id=eq.${company}`, 'DELETE');
  }
  for (const user of users) await request(`/backend/auth/v1/admin/users/${user.id}`, 'DELETE');
  record('cleanup', { users: users.length, companies: companies.length });
}
