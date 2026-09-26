// Scraper de la Biblioteca de Anuncios de Meta vía Apify — endpoint del navegador.
//
// Recibe { url } o { urls: [...] } o { adIds: [...] } o { pageId }.
// Devuelve, por ad_id: { ad_id, page_name, video_url, image_url, body, title, … }
//
// Best-effort: si Apify falla devuelve results:[] con reason, SIN romper, y el
// motivo real queda en los Function Logs de Vercel.
//
// La lógica vive en _lib/apify.js porque el worker de la cola la necesita igual
// y no puede pasar por HTTP para llegar a sí mismo.
import { requireTeamMember, sendAuthError } from "./_lib/auth.js";
import { scrapeAdLibrary, urlDePagina } from "./_lib/apify.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  try { await requireTeamMember(req); } catch (err) { return sendAuthError(res, err); }

  const body = req.body || {};
  // Búsqueda precisa por página (view_all_page_id) = todos los anuncios de esa
  // marca, exacto (mejor que keyword). Si viene pageId, construimos esa URL.
  const raw = body.pageId
    ? [urlDePagina(body.pageId)]
    : (body.urls || body.adIds || (body.url ? [body.url] : []) || []);
  const list = (Array.isArray(raw) ? raw : [raw]).map((x) => x && (x.url || x)).filter(Boolean);
  if (!list.length) return res.status(400).json({ error: "Falta url/urls/adIds/pageId" });

  const out = await scrapeAdLibrary(list, { count: body.count });
  return res.status(200).json(out);
}
