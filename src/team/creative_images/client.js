import { buildApiHeaders } from '../../lib/apiAuth.js';

export async function creativeRequest(action, data = {}, { method = 'GET', signal, auth = false } = {}) {
  const endpoint = auth ? '/api/creative-mcp-auth' : '/api/creative-images';
  const query = new URLSearchParams(method === 'GET' ? { action, ...data } : { action });
  const response = await fetch(`${endpoint}?${query}`, { method, headers: await buildApiHeaders(), signal,
    ...(method === 'POST' ? { body: JSON.stringify({ action, ...data }) } : {}) });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'No se pudo completar la solicitud');
  return body;
}

export function decodeConnection(search) {
  try {
    const value = new URLSearchParams(search).get('request');
    if (!value || value.length > 8000) return null;
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))));
  } catch { return null; }
}
