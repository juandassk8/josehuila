// Link público de un brief — la hoja de rodaje que abre una creadora UGC.
//
// Tres operaciones:
//   GET  ?token=…            → SIN auth. Lo que ve la creadora.
//   POST { action:"create" } → con auth. Crea el link desde la selección.
//   POST { action:"revoke" } → con auth. Lo desactiva.
//
// Por qué un endpoint y no leer desde el browser: `anon` está bloqueado en todas
// las tablas de tenant (rls_hardening_v1/v2). Acá se usa service_role y se
// devuelve SOLO lo que la creadora necesita — lo que no se manda, no se filtra.
// Nada de métricas, feedback, editor, etapa ni notas internas.

import { requireCompanyAccess, sendAuthError, serviceClient } from "./_lib/auth.js";
import { randomBytes } from "node:crypto";

export const config = { api: { bodyParser: { sizeLimit: "1mb" } }, maxDuration: 30 };

const slugify = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

// Sufijo aleatorio: el link se manda por WhatsApp, así que no puede ser adivinable
// a partir del nombre de la empresa. Sin caracteres ambiguos (0/o, 1/l).
const randomSuffix = (n = 16) => {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(n); // aleatoriedad criptográfica: Math.random() es predecible
  let out = "";
  for (let i = 0; i < n; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
};

// Lo que la creadora necesita para grabar, y nada más.
function publicSlot(s) {
  const refs = (Array.isArray(s.refs) ? s.refs : [])
    .filter((r) => r && typeof r === "object")
    .map((r) => ({
      id: r.id,
      name: r.name || "",
      brand: r.brand || "",
      format: r.format === "static" ? "static" : "video",
      cover: r.file_url || "",
      video: r.drive_url || "",
      // Si no hay respaldo en Drive, la biblioteca de anuncios de Meta es
      // pública: sirve de plan B para que igual pueda ver la referencia.
      meta: r.meta_ads_library_url || "",
    }));
  return {
    num: s.num,
    producto: s.producto || "",
    angulo: s.angulo || "",
    concepto: s.concepto || "",
    // El nivel viaja aparte y la hoja compone "UGC MOFU" al vuelo, igual que el
    // portal. Nunca se manda la cadena ya armada.
    nivel_conciencia: s.nivel_conciencia || "",
    creador: s.creador || "",
    desc: s.descripcion || "",
    script: s.script || "",         // HTML; se sanea en el cliente
    loom: s.loom || "",
    // La carpeta del MATERIAL CRUDO: es donde ella sube lo que grabó.
    // `drive` es la del creativo — ahí deja el editor lo ya montado, y mandarla
    // a esa carpeta le hacía subir el material al lugar equivocado.
    upload: s.drive_raw || "",
    due: s.due || "",
    refs,
  };
}

export default async function handler(req, res) {
  const sb = serviceClient();

  // ── Vista pública: sin sesión, solo con el token ────────────────────────────
  if (req.method === "GET") {
    const token = String(req.query?.token || "").trim();
    if (!token) return res.status(400).json({ error: "Falta token" });

    const { data: link } = await sb
      .from("pipeline_share_links")
      .select("company_id, brief_id, brief_name, slot_ids, revoked_at")
      .eq("token", token)
      .maybeSingle();

    // Mismo mensaje para "no existe" y "revocado": no hay por qué confirmarle a
    // nadie que un token existió.
    if (!link || link.revoked_at) return res.status(404).json({ error: "Este link ya no está disponible." });

    // Brief en la papelera → el link deja de servir. Antes esto salía gratis:
    // borrar el brief borraba sus slots y la hoja quedaba vacía sola. Ahora los
    // slots sobreviven al borrado, así que hay que preguntarlo. Sin esto, borrar
    // un brief lo saca del portal pero lo deja publicado para cualquiera que
    // tenga el link, que es exactamente lo contrario de lo que se quiso hacer.
    if (link.brief_id) {
      const { data: brief } = await sb
        .from("pipeline_briefs").select("deleted_at").eq("id", link.brief_id).maybeSingle();
      if (brief?.deleted_at) return res.status(404).json({ error: "Este link ya no está disponible." });
    }

    const ids = Array.isArray(link.slot_ids) ? link.slot_ids : [];
    if (!ids.length) return res.status(200).json({ ok: true, brief: link.brief_name || "Brief", company: "", slots: [] });

    // `nivel_conciencia` es de db/pipeline_numeracion_conciencia_estaticos.sql.
    // Si ese SQL todavía no se corrió, PostgREST rechaza el SELECT ENTERO por
    // pedir una columna que no existe — y la hoja de rodaje que la creadora ya
    // tiene en WhatsApp dejaría de abrir. Se reintenta sin ella.
    const COLS = "num, producto, angulo, concepto, creador, descripcion, script, loom, drive_raw, due, refs";
    const traerSlots = (cols) => sb.from("pipeline_slots")
      .select(cols)
      .in("id", ids)
      .eq("company_id", link.company_id)   // el token manda, pero igual se acota a su empresa
      .order("num", { ascending: true });

    const [slotsRes, { data: company }] = await Promise.all([
      traerSlots(`${COLS}, nivel_conciencia`),
      sb.from("companies").select("name").eq("id", link.company_id).maybeSingle(),
    ]);
    const rows = slotsRes.error ? (await traerSlots(COLS)).data : slotsRes.data;

    return res.status(200).json({
      ok: true,
      company: company?.name || "",
      brief: link.brief_name || "Brief",
      slots: (rows || []).map(publicSlot),
    });
  }

  if (req.method !== "POST") return res.status(405).end();

  const { action, companyId, briefId, briefName, slotIds, token } = req.body || {};
  if (!companyId) return res.status(400).json({ error: "Falta companyId" });

  let user;
  try {
    user = await requireCompanyAccess(req, companyId);
  } catch (err) {
    return sendAuthError(res, err);
  }

  // Los links que ya se mandaron. Sin esto no había forma de saber qué está
  // circulando ni de apagar uno viejo.
  if (action === "list") {
    const { data, error } = await sb
      .from("pipeline_share_links")
      .select("token, brief_name, slot_ids, created_at, revoked_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({
      ok: true,
      links: (data || []).map((l) => ({
        token: l.token,
        brief: l.brief_name || "Guiones",
        count: Array.isArray(l.slot_ids) ? l.slot_ids.length : 0,
        at: l.created_at,
        active: !l.revoked_at,
      })),
    });
  }

  // Renombrar. No toca el token: el link que ya circula sigue funcionando, solo
  // cambia el título que ve la creadora y el nombre de la lista.
  if (action === "rename") {
    if (!token) return res.status(400).json({ error: "Falta token" });
    const nombre = String(briefName || "").trim().slice(0, 120);
    if (!nombre) return res.status(400).json({ error: "El nombre no puede quedar vacío" });
    const { error } = await sb
      .from("pipeline_share_links")
      .update({ brief_name: nombre })
      .eq("token", token).eq("company_id", companyId);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  // Apagar o volver a prender un link. Reactivar existe porque desactivar por
  // error no debería obligar a mandar una dirección nueva por WhatsApp.
  if (action === "revoke" || action === "restore") {
    if (!token) return res.status(400).json({ error: "Falta token" });
    const { error } = await sb
      .from("pipeline_share_links")
      .update({ revoked_at: action === "revoke" ? new Date().toISOString() : null })
      .eq("token", token).eq("company_id", companyId);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  if (action === "create") {
    const ids = (Array.isArray(slotIds) ? slotIds : []).filter(Boolean);
    if (!ids.length) return res.status(400).json({ error: "Elegí al menos un guion" });

    const { data: company } = await sb.from("companies").select("slug, name").eq("id", companyId).maybeSingle();
    const base = slugify(company?.slug || company?.name || "brief");
    const newToken = `${base}-${slugify(briefName || "brief") || "brief"}-${randomSuffix()}`;

    const { error } = await sb.from("pipeline_share_links").insert({
      token: newToken,
      company_id: companyId,
      brief_id: briefId || null,
      brief_name: briefName || null,
      slot_ids: ids,
      created_by: user?.id || null,
    });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true, token: newToken });
  }

  return res.status(400).json({ error: `Acción desconocida: ${action}` });
}
