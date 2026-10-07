export const contextFields = [
  ['description', 'Qué hace tu marca', 'Qué vendes y qué cambio buscas para tus clientes.'],
  ['audience', 'Público de la marca', 'A quién le hablas: necesidades, contexto y motivaciones.'],
  ['differentiation', 'Qué te hace diferente', 'Razones concretas para elegirte.'],
  ['positioning', 'Cómo quieres que te recuerden', 'La idea que quieres que las personas asocien con tu marca.'],
];
export const voiceFields = [
  ['tone_notes', 'Tono de voz', 'Cómo quieres que suene tu marca.'],
  ['patterns', 'Estilo y estructura', 'Patrones de comunicación que quieres mantener.'],
  ['phrases', 'Frases de marca', 'Expresiones que identifican a tu marca.'],
  ['never_say', 'Lo que no decimos', 'Palabras, afirmaciones o promesas que debemos evitar.'],
];
export function ensureProductIds(products, uuid = () => crypto.randomUUID()) {
  const seen = new Set();
  return products.map(product => {
    if (product.id && seen.has(product.id)) throw new Error('Hay productos con identificadores repetidos. Revisa el catálogo antes de guardar.');
    const id = product.id || uuid(); seen.add(id);
    return { ...product, id };
  });
}
export function productReadiness(product) {
  const checks = [!!String(product.name || '').trim(), !!String(product.what || product.benefit || product.promise || product.benefits || '').trim(),
    !!String(product.avatar || '').trim(), !!String(product.price || '').trim(), Array.isArray(product.images) && product.images.length > 0];
  return { complete: checks.filter(Boolean).length, total: checks.length };
}
export function documentText(document) { return document.raw_content || document.content || document.extracted_summary || ''; }
export function photoUrl(photo, companyId) {
  if (!photo?.path || !photo.path.startsWith(`${companyId}/`)) return null;
  if (!/^[a-zA-Z0-9_-]{1,160}\/[a-f0-9-]{36}\.(jpg|png|webp)$/.test(photo.path)) return null;
  return `/backend/storage/v1/object/company-assets/${photo.path.split('/').map(encodeURIComponent).join('/')}`;
}
