// Smoke test de la API oficial de Meta Ad Library. No integra datos a Inforce.
// Ejemplo: META_AD_LIBRARY_TOKEN=<secreto> node scripts/meta-ad-library-probe.mjs --page-id=123 --country=CO
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ENDPOINT = 'https://graph.facebook.com/ads_archive';
const AD_TYPES = new Set(['ALL', 'POLITICAL_AND_ISSUE_ADS']);
const FIELDS = [
  'id',
  'page_id',
  'page_name',
  'ad_delivery_start_time',
  'ad_delivery_stop_time',
  'publisher_platforms',
  'impressions',
  'eu_total_reach',
  'total_reach_by_location',
].join(',');

export function buildAdLibraryRequest({ country = 'CO', pageId, search, adType = 'ALL' }) {
  const normalizedCountry = String(country).toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalizedCountry)) throw new Error('El país debe ser un código de dos letras, como CO o US.');
  if (!AD_TYPES.has(adType)) throw new Error('Tipo de anuncio no admitido.');
  if (pageId && search) throw new Error('Usa --page-id o --search, no ambos.');
  if (!pageId && !search) throw new Error('Indica --page-id=<ID> o --search=<texto>.');
  if (pageId && !/^\d{1,20}$/.test(String(pageId))) throw new Error('El ID de página debe ser numérico.');
  if (search && (String(search).length > 100 || !String(search).trim())) throw new Error('La búsqueda debe tener entre 1 y 100 caracteres.');

  const url = new URL(ENDPOINT);
  url.searchParams.set('ad_reached_countries', JSON.stringify([normalizedCountry]));
  url.searchParams.set('ad_type', adType);
  url.searchParams.set('ad_active_status', 'ACTIVE');
  url.searchParams.set('fields', FIELDS);
  url.searchParams.set('limit', '5');
  if (pageId) url.searchParams.set('search_page_ids', `[${pageId}]`);
  else url.searchParams.set('search_terms', String(search).trim());
  return url;
}

function safeAd(ad) {
  return {
    id: ad.id ?? null,
    page_id: ad.page_id ?? null,
    page_name: ad.page_name ?? null,
    ad_delivery_start_time: ad.ad_delivery_start_time ?? null,
    ad_delivery_stop_time: ad.ad_delivery_stop_time ?? null,
    publisher_platforms: ad.publisher_platforms ?? [],
    impressions: ad.impressions ?? null,
    eu_total_reach: ad.eu_total_reach ?? null,
    total_reach_by_location: ad.total_reach_by_location ?? null,
  };
}

export async function probeAdLibrary({ token, fetchImpl = fetch, ...filters }) {
  if (!token) throw new Error('Falta META_AD_LIBRARY_TOKEN. Obtén acceso a Ad Library API en Meta for Developers.');
  const url = buildAdLibraryRequest(filters);
  const response = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  let body;
  try { body = await response.json(); }
  catch { throw new Error(`Meta devolvió una respuesta no JSON (HTTP ${response.status}).`); }
  if (!response.ok || body.error) {
    const type = String(body.error?.type || 'Error').replace(/[^\w]/g, '').slice(0, 40);
    const code = Number.isInteger(body.error?.code) ? body.error.code : 'desconocido';
    // No mostrar el mensaje ni la URL: Meta puede incluir el token en las URLs de respuesta.
    throw new Error(`Meta rechazó la consulta (HTTP ${response.status}; ${type} ${code}).`);
  }
  if (!Array.isArray(body.data)) throw new Error('Meta devolvió una respuesta sin lista de anuncios.');
  return {
    count: body.data.length,
    has_more: Boolean(body.paging?.next),
    ads: body.data.map(safeAd),
  };
}

function parseArgs(args) {
  const options = {};
  for (const arg of args) {
    const match = /^--(page-id|search|country|type)=(.+)$/.exec(arg);
    if (!match) throw new Error(`Argumento no válido: ${arg}`);
    const names = { 'page-id': 'pageId', search: 'search', country: 'country', type: 'adType' };
    options[names[match[1]]] = match[2];
  }
  return options;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const filters = parseArgs(process.argv.slice(2));
    const result = await probeAdLibrary({ token: process.env.META_AD_LIBRARY_TOKEN, ...filters });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
