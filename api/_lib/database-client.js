import { createDataClient } from '../../shared/postgres-client.js';

export function createClient(url, key) {
  const headers = async () => key ? { Authorization: `Bearer ${key}` } : {};
  const client = createDataClient(url, { headers, publicUrl: `${process.env.PUBLIC_BASE_URL || url.replace(/\/backend$/, '')}/backend` });
  const authRequest = async (path, method = 'GET', body, token = key) => {
    try {
      const res = await fetch(`${url}/auth/v1/${path}`, { method, headers: { Authorization: `Bearer ${token || ''}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
      const data = await res.json();
      return res.ok ? { data, error: null } : { data: {}, error: { ...data, message: data.message || data.error } };
    } catch (error) { return { data: {}, error: { message: error.message } }; }
  };
  client.auth = {
    getUser: async token => { const r = await authRequest('user', 'GET', undefined, token); return { data: { user: r.error ? null : r.data }, error: r.error }; },
    admin: {
      createUser: values => authRequest('admin/users', 'POST', values),
      updateUserById: (id, values) => authRequest(`admin/users/${encodeURIComponent(id)}`, 'PUT', values),
      getUserById: id => authRequest(`admin/users/${encodeURIComponent(id)}`),
      deleteUser: id => authRequest(`admin/users/${encodeURIComponent(id)}`, 'DELETE'),
      listUsers: ({ page = 1, perPage = 50 } = {}) => authRequest(`admin/users?page=${page}&per_page=${perPage}`),
    },
  };
  return client;
}
