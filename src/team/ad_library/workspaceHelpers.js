import { buildApiHeaders } from '../../lib/apiAuth.js';

export async function request(method, payload) {
  const response = await fetch(`/api/ad-library${method === 'GET' ? `?${new URLSearchParams(payload)}` : ''}`, {
    method, headers: await buildApiHeaders(), body: method === 'POST' ? JSON.stringify(payload) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Error ${response.status}`);
  return data;
}
export const date = value => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'Sin fecha';
export const number = value => Number(value || 0).toLocaleString('es-CO');
export const safeHref = value => { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined; } catch { return undefined; } };
export const formatName = value => ({ video: 'Videos', image: 'Imágenes', carousel: 'Carruseles', other: 'Otros' }[value] || 'Otros');
export const statusName = value => ({ active: 'Activo', inactive: 'Inactivo', not_observed: 'Ya no observado' }[value] || 'Sin estado');

