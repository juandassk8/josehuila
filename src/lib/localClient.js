import { createDataClient } from '../../shared/postgres-client.js';

export const STORAGE_KEY = 'inforce-local-auth';

export function createClient(url) {
  const listeners = new Set();
  const channels = new Set();
  let refreshing = null;
  let source = null;
  let refreshTimer = null;
  let memorySession = null;
  const readSession = () => memorySession;
  const notify = (event, session) => {
    for (const listener of listeners) queueMicrotask(() => listener(event, session));
  };
  const persist = (session, event) => {
    memorySession = session || null;
    // Elimina sesiones de versiones anteriores: el access token vive solo en
    // memoria; al recargar se recupera mediante la cookie HttpOnly.
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage privado */ }
    if (refreshTimer) clearTimeout(refreshTimer);
    if (session?.expires_at) refreshTimer = setTimeout(() => auth.refreshSession(), Math.max(1000, session.expires_at * 1000 - Date.now() - 60_000));
    if (!session) { source?.close(); source = null; }
    notify(event, session);
  };
  const request = async (path, body, token) => {
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`${url}/auth/v1/${path}`, { method: body === undefined ? 'GET' : 'POST', credentials: 'include', headers, body: body === undefined ? undefined : JSON.stringify(body) });
      const data = await res.json();
      return res.ok ? { data, error: null } : { data: {}, error: { ...data, message: data.message || data.error || 'No se pudo completar la solicitud', status: res.status } };
    } catch (error) { return { data: {}, error: { message: error.message } }; }
  };
  const auth = {
    async signInWithPassword(credentials) {
      const result = await request('token?grant_type=password', credentials);
      if (!result.error) persist(result.data, 'SIGNED_IN');
      return { data: { session: result.error ? null : result.data, user: result.data?.user || null }, error: result.error };
    },
    async signUp(credentials) {
      const result = await request('signup', credentials);
      if (!result.error && result.data.access_token) persist(result.data, 'SIGNED_IN');
      return { data: { session: result.data.access_token ? result.data : null, user: result.data?.user || null }, error: result.error };
    },
    async getSession() {
      const session = readSession();
      if (!session) return auth.refreshSession();
      if (session && session.expires_at * 1000 <= Date.now() + 60_000) return auth.refreshSession();
      return { data: { session }, error: null };
    },
    async getUser(token) {
      const session = token ? null : (await auth.getSession()).data.session;
      const result = await request('user', undefined, token || session?.access_token);
      return { data: { user: result.error ? null : result.data }, error: result.error };
    },
    async refreshSession() {
      if (refreshing) return refreshing;
      refreshing = (async () => {
        const result = await request('token?grant_type=refresh_token', {});
        if (!result.error) persist(result.data, 'TOKEN_REFRESHED');
        else if (result.error.status === 401) persist(null, 'SIGNED_OUT');
        return { data: { session: result.error ? null : result.data, user: result.data?.user || null }, error: result.error };
      })().finally(() => { refreshing = null; });
      return refreshing;
    },
    async signOut() {
      const result = await request('logout', {}, readSession()?.access_token);
      persist(null, 'SIGNED_OUT');
      return result;
    },
    onAuthStateChange(listener) {
      listeners.add(listener);
      return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } };
    },
    async updateUser(values) {
      const session = (await auth.getSession()).data.session;
      const result = await request('user', values, session?.access_token);
      if (!result.error && session) persist(null, 'SIGNED_OUT');
      return { data: { user: result.error ? null : result.data }, error: result.error };
    },
    resetPasswordForEmail: email => request('recover', { email }),
    signInWithOAuth: async () => ({ data: {}, error: { message: 'El acceso con Google no está configurado en esta instalación. Usa correo y contraseña.' } }),
  };
  const client = createDataClient(url, {
    headers: async () => { const s = (await auth.getSession()).data.session; return s?.access_token ? { Authorization: `Bearer ${s.access_token}` } : {}; },
  });
  client.auth = auth;
  // SSE solo invalida datos. Cada pantalla vuelve a leer con su JWT y sus políticas RLS.
  const connect = () => {
    if (source || !channels.size || !readSession() || typeof EventSource === 'undefined') return;
    source = new EventSource(`${url}/events`, { withCredentials: true });
    source.onmessage = event => {
      const change = JSON.parse(event.data);
      for (const channel of channels) for (const binding of channel.bindings) {
        if (binding.options.table === change.table) binding.callback({ eventType: change.event, new: null, old: null });
      }
    };
  };
  client.channel = name => {
    const channel = { name, bindings: [], on(type, options, callback) { this.bindings.push({ type, options, callback }); return this; }, subscribe(callback) { channels.add(this); connect(); callback?.('SUBSCRIBED'); return this; }, unsubscribe() { channels.delete(this); if (!channels.size) { source?.close(); source = null; } } };
    return channel;
  };
  client.removeChannel = channel => channel?.unsubscribe();
  if (typeof window !== 'undefined') {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage privado */ }
    window.addEventListener('focus', () => { auth.getSession(); connect(); });
  }
  return client;
}
