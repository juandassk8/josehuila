import { AuthError } from '../auth.js';

// Shared platforms are useful destinations, but cannot prove a common brand.
const sharedHosts = ['facebook.com', 'fb.com', 'fb.me', 'instagram.com', 'wa.me', 'whatsapp.com',
  'youtube.com', 'youtu.be', 'tiktok.com', 'twitter.com', 'x.com', 't.co', 'linktr.ee', 'bit.ly',
  'forms.gle', 'google.com', 'goo.gl', 'amzn.to', 'amazon.com', 'amazon.com.mx', 'amazon.es',
  'mercadolibre.com', 'mercadolibre.com.co', 'mercadolibre.com.mx', 'hotmart.com',
  'beacons.ai', 'bio.site', 'taplink.cc', 'shop.app'];
export const isSharedDestination = domain => sharedHosts.some(host => domain === host || domain.endsWith(`.${host}`));

export function buildBrandNetwork(brands, evidence, { truncated = false } = {}) {
  const byId = new Map(brands.map(brand => [brand.id, brand]));
  const edges = evidence.filter(edge => byId.has(edge.brandId) && /^[a-z0-9.-]+\.[a-z]{2,63}$/.test(edge.domain)
    && (edge.adCount > 0 || edge.profileLinked === true)).map(edge => ({ ...edge,
    name: byId.get(edge.brandId).name, pageId: byId.get(edge.brandId).meta_page_id,
    shared: isSharedDestination(edge.domain) }));
  const domains = new Map(), parent = new Map(brands.map(brand => [brand.id, brand.id]));
  const root = id => { let next = id; while (parent.get(next) !== next) next = parent.get(next); return next; };
  for (const edge of edges) {
    if (!domains.has(edge.domain)) domains.set(edge.domain, []);
    domains.get(edge.domain).push(edge);
    if (edge.shared || truncated) continue;
    const first = domains.get(edge.domain).find(item => !item.shared);
    const a = root(first.brandId), b = root(edge.brandId);
    if (a !== b) parent.set(a < b ? b : a, a < b ? a : b);
  }
  const components = new Map();
  for (const brand of brands) {
    const key = root(brand.id);
    if (!components.has(key)) components.set(key, []);
    components.get(key).push(brand.id);
  }
  const families = [];
  if (!truncated) for (const [id, brandIds] of components) {
    const selected = new Set(brandIds);
    const linked = [...new Set(edges.filter(edge => selected.has(edge.brandId) && !edge.shared).map(edge => edge.domain))].sort();
    // A single fanpage/domain pair stays a standalone library.
    if (!linked.length || (brandIds.length === 1 && linked.length === 1)) continue;
    families.push({ id, name: byId.get(id).name, brandIds: brandIds.sort(), domains: linked });
  }
  return { families: families.sort((a, b) => a.name.localeCompare(b.name)),
    domains: [...domains].sort(([a], [b]) => a.localeCompare(b)).map(([domain, links]) => ({ domain,
      shared: isSharedDestination(domain), fanpages: links.sort((a, b) => a.name.localeCompare(b.name)) })), truncated };
}

export async function readBrandNetwork(client, companyId, brands) {
  const result = await client.rpc('ad_library_brand_network', { p_company: companyId });
  if (result.error) throw Error('BRAND_NETWORK_UNAVAILABLE');
  return buildBrandNetwork(brands, result.data?.edges || [], { truncated: result.data?.truncated === true });
}

export function familyBrandIds(network, familyId) {
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(String(familyId || '')))
    throw new AuthError(400, 'Agrupación inválida');
  const family = network.families.find(item => item.brandIds.includes(familyId));
  if (!family) throw new AuthError(403, 'La agrupación ya no está disponible para esta empresa. Actualiza la biblioteca.');
  return family.brandIds;
}
