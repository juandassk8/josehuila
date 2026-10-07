import { buildApiHeaders } from '../../lib/apiAuth.js';

export async function adminRequest(method, payload, signal) {
  const response = await fetch(`/api/admin-operations${method === 'GET' ? `?${new URLSearchParams(payload)}` : ''}`, {
    method, headers: await buildApiHeaders(), signal,
    body: method === 'POST' ? JSON.stringify(payload) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || 'No se pudo completar la solicitud.'), { status: response.status });
  return data;
}

export const number = value => value == null ? '—' : Number(value).toLocaleString('es-CO');
export const dateTime = value => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : 'Sin registro';
export const engineName = value => ({ meta_web: 'Chrome · Meta', meta_official: 'API Meta', scrapling: 'Scrapling', stored_capture: 'Captura importada' }[value] || 'Sin confirmar');
export const errorLabel = code => ({ META_RATE_LIMITED: 'Pausa indicada por Meta', META_SCHEMA_CHANGED: 'Cambió la respuesta de Meta; requiere revisión',
  META_PROXY_UNAVAILABLE: 'El proxy no permite conectar. Revisa las conexiones en Administración → Proxies.',
  META_AUTH_REQUIRED: 'Meta solicita autenticación', COLLECTION_INCOMPLETE: 'No se pudo verificar el final de la consulta',
  CRAWL_FAILED: 'La consulta terminó con un error', META_CRAWL_TIMEOUT: 'Se agotó el tiempo de consulta',
  META_NO_SEARCH_DATA: 'Meta no entregó los datos de búsqueda', META_PAGINATION_STALLED: 'La consulta dejó de avanzar' }[code] || 'Consulta sin completar; revisa los intentos');
export const settingLabels = { enabled: 'Recolección', changes_hours: 'Con cambios (h)', quiet_hours: 'Sin cambios (h)',
  error_hours: 'Tras un error (h)', scrapling_enabled: 'Respaldo Scrapling' };
export const displaySetting = value => typeof value === 'boolean' ? value ? 'Activada' : 'Pausada' : number(value);
export function changedSettings(before, after) {
  return Object.keys(settingLabels).filter(key => before?.[key] !== after?.[key])
    .map(key => `${settingLabels[key]}: ${displaySetting(before?.[key])} → ${displaySetting(after?.[key])}`);
}
