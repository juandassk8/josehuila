// Blinda portadas — endpoint del navegador.
//
// Desde la página no se puede bajar de fbcdn: exige `Referer` de Facebook y CORS
// lo bloquea. La lógica vive en _lib/covers.js porque el worker de la cola la
// usa en proceso, sin pasar por HTTP.

import { requireTeamMember, sendAuthError } from "./_lib/auth.js";
import { rehostTanda, esPropia, MAX_URLS } from "./_lib/covers.js";

export const config = { api: { bodyParser: { sizeLimit: "1mb" } }, maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  try {
    await requireTeamMember(req);
  } catch (err) {
    return sendAuthError(res, err);
  }

  const urls = (Array.isArray(req.body?.urls) ? req.body.urls : []).slice(0, MAX_URLS);
  if (!urls.length) return res.status(200).json({ ok: true, covers: {} });

  // En paralelo: son descargas cortas y el request tiene 60s.
  const pares = await rehostTanda(urls);

  const covers = {};
  const hashes = {};
  let blindadas = 0;
  for (const [orig, nueva, hash] of pares) {
    covers[orig] = nueva;
    if (hash) hashes[orig] = hash;
    if (nueva && !esPropia(String(orig))) blindadas++;
  }
  return res.status(200).json({ ok: true, covers, hashes, blindadas, total: urls.length });
}
