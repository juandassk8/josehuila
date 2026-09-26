// Helpers de la Facebook Ads Library.

// Extrae el page_id de un link de la Facebook Ads Library (view_all_page_id) o
// de un page_id pegado directo. Con page_id, Apify scrapea ESA página exacta →
// solo anuncios de esa marca, sin las confusiones de buscar por nombre genérico.
// Devuelve null si el input es un nombre de marca normal (búsqueda por keyword).
export function extractAdLibraryPageId(input) {
  if (!input) return null;
  const s = String(input).trim();
  const m = s.match(/view_all_page_id=(\d+)/i);
  if (m) return m[1];
  // page_id pegado directo (solo dígitos, largo típico de un id de página de FB).
  if (/^\d{6,}$/.test(s)) return s;
  return null;
}
