// Propone una reorganización de la taxonomía de etiquetas del banco con IA.
// Lee todos los bank_labels (service_role), arma el vocabulario con conteos y le
// pide a Claude un PLAN conservador: renombrar (canonical), unificar variantes/
// sinónimos, y MOVER valores mal categorizados (ej. "Bajar de peso": nicho→ángulo).
// NO aplica nada — solo devuelve el plan para que el usuario revise y apruebe.
import { requireTeamMember, sendAuthError, serviceClient } from "./_lib/auth.js";

const MODEL = "claude-sonnet-4-6";
const CATS = ["marca", "nicho", "subnicho", "angulo", "formato"];

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY no configurada" });
  try { await requireTeamMember(req); } catch (err) { return sendAuthError(res, err); }

  try {
    // 1) Vocabulario con conteos por categoría — UNIENDO banco (variaciones) +
    //    bandeja (referentes) para que la IA organice las etiquetas de todos lados.
    const sb = serviceClient();
    const counters = {}; for (const c of CATS) counters[c] = new Map();   // incluye subnicho (evita crash)
    const tally = (rows, col) => {
      for (const r of rows || []) {
        const l = r[col] || {};
        for (const c of CATS) for (const v of (Array.isArray(l[c]) ? l[c] : [])) {
          const val = (v || "").toString().trim(); if (!val) continue;
          counters[c].set(val, (counters[c].get(val) || 0) + 1);
        }
      }
    };
    const [bank, inbox] = await Promise.all([
      sb.from("despliegue_variations").select("bank_labels").not("bank_labels", "is", null).limit(20000),
      sb.from("reference_inbox").select("suggested_labels").not("suggested_labels", "is", null).limit(20000),
    ]);
    if (bank.error) throw bank.error;
    tally(bank.data, "bank_labels");
    if (!inbox.error) tally(inbox.data, "suggested_labels");
    const vocab = {};
    for (const c of CATS) vocab[c] = [...counters[c].entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);

    // 2) Claude propone el plan.
    const sys = `Sos un director de marketing de performance organizando la TAXONOMÍA de un banco de referencias de anuncios. Hay 4 categorías de etiqueta y cada valor debe estar en la correcta:
- MARCA: el anunciante / brand (ej. Cymbiotika, Goli, Nike). Debe estar deduplicada y con la escritura canónica.
- NICHO: el MERCADO / vertical AMPLIO que sirve el producto (ej. Salud, Belleza, Calzado, Ropa, Mascotas, Fitness, Hogar). Un mercado, NO un beneficio ni un formato.
- SUBNICHO: un sub-mercado más fino DENTRO del nicho (ej. Salud→Suplementos/Sueño/Digestión; Belleza→Skincare/Cabello). Si un valor es un sub-mercado de otro nicho, movelo a subnicho (y el ref debería tener el nicho amplio también). NO es un beneficio.
- ÁNGULO: el ÁNGULO DE VENTA / beneficio / gancho persuasivo (ej. Bajar de peso, Más energía, Antiedad, Ahorro, Antes/Después, Miedo a X). Es la PERSUASIÓN, no el mercado.
- FORMATO: CÓMO está hecho el anuncio (ej. UGC, Diálogo, Testimonial, Unboxing, Founder, POV, B-roll, Estático). Es la ejecución.
Tu trabajo: proponer una limpieza CONSERVADORA y correcta. Solo cambios claros y defendibles. No inventes valores nuevos que no existan (salvo la escritura canónica de una marca).`;

    const userTxt = `Vocabulario actual (valor · cuántas referencias lo usan):

${CATS.map((c) => `${c.toUpperCase()}:\n${vocab[c].map((x) => `  - ${x.value} (${x.count})`).join("\n") || "  (vacío)"}`).join("\n\n")}

Devolvé SOLO un JSON con este formato (sin texto extra):
{
  "renames": [{ "category": "marca|nicho|angulo|formato", "from": "valor actual", "to": "escritura canónica", "reason": "breve" }],
  "merges":  [{ "category": "...", "from": ["variante1","variante2"], "to": "valor canónico", "reason": "breve" }],
  "moves":   [{ "value": "valor", "from_category": "...", "to_category": "...", "reason": "breve" }]
}
Reglas: renames = solo cambio de escritura de un valor. merges = varios valores que son el mismo (sinónimos/variantes) → uno. moves = valor que está en la categoría equivocada (ej. un ángulo de venta metido en nicho). Si algo ya está bien, no lo incluyas. Prioridad: mover lo mal categorizado y unificar duplicados evidentes.`;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 2500, system: sys, messages: [{ role: "user", content: userTxt }] }),
    });
    if (!resp.ok) throw new Error(`Claude: ${await resp.text()}`);
    const cd = await resp.json();
    let raw = (cd.content?.[0]?.text || "").trim();
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/); if (fenced) raw = fenced[1].trim();
    const first = raw.indexOf("{"), last = raw.lastIndexOf("}");
    if (first >= 0 && last > first) raw = raw.slice(first, last + 1);
    let plan;
    try { plan = JSON.parse(raw); } catch { return res.status(200).json({ ok: false, reason: "La IA no devolvió un plan válido.", vocab }); }
    return res.status(200).json({ ok: true, plan: { renames: plan.renames || [], merges: plan.merges || [], moves: plan.moves || [] }, vocab });
  } catch (e) {
    return res.status(200).json({ ok: false, reason: e.message });
  }
}
