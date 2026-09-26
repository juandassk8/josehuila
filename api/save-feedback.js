import { createClient } from "./_lib/database-client.js";
import { requireCompanyAccess, sendAuthError } from "./_lib/auth.js";

export const config = {
  api: { bodyParser: { sizeLimit: "1mb" } },
  maxDuration: 30,
};

// Guarda una regla de la IA — append con prefijo [YYYY-MM-DD].
//
// Modos:
//   kind="memory"    → accumulated_feedback (recomendación / regla aprendida)
//   kind="must"      → must_say (obligatorio mencionar)
//   kind="forbidden" → never_say (prohibido)
//
// Scope:
//   con companyId → company_voice_profile (workspace por empresa)
//   sin companyId → voice_profile global (modo team mode legacy)

const COLUMN_BY_KIND = {
  memory: "accumulated_feedback",
  must: "must_say",
  forbidden: "never_say",
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { feedback, companyId = null, kind = "memory" } = req.body || {};
  if (!feedback?.trim()) {
    return res.status(400).json({ error: "feedback is required" });
  }

  const column = COLUMN_BY_KIND[kind];
  if (!column) {
    return res.status(400).json({ error: `invalid kind: ${kind}` });
  }

  if (!process.env.BACKEND_URL || !process.env.BACKEND_SERVICE_KEY) {
    return res.status(500).json({ error: "Supabase env vars not configured" });
  }

  // AUTH: usa el service_role (bypassa RLS) para escribir en voice_profile —
  // antes NO validaba nada. Exigimos JWT cuyo dueño pueda acceder a companyId
  // (o sea team Inforce si companyId es null → modo team legacy).
  try {
    await requireCompanyAccess(req, companyId);
  } catch (err) {
    return sendAuthError(res, err);
  }

  const sb = createClient(process.env.BACKEND_URL, process.env.BACKEND_SERVICE_KEY);

  try {
    const tableName = companyId ? "company_voice_profile" : "voice_profile";
    const timestamp = new Date().toISOString().slice(0, 10);

    let current;
    if (companyId) {
      const { data, error } = await sb
        .from("company_voice_profile")
        .select(`id, ${column}`)
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw error;
      current = data;
      if (!current) {
        // No hay fila aún — crearla con la regla inicial.
        const payload = {
          company_id: companyId,
          [column]: `[${timestamp}] ${feedback.trim()}`,
          updated_at: new Date().toISOString(),
        };
        const { error: insErr } = await sb.from("company_voice_profile").insert(payload);
        if (insErr) throw insErr;
        return res.status(200).json({ ok: true, totalLength: payload[column].length });
      }
    } else {
      const { data, error } = await sb
        .from("voice_profile")
        .select(`id, ${column}`)
        .limit(1)
        .single();
      if (error) throw error;
      current = data;
      if (!current) {
        return res.status(500).json({ error: "No voice profile row found" });
      }
    }

    const existing = current[column] || "";
    const separator = existing ? "\n\n" : "";
    const newValue = `${existing}${separator}[${timestamp}] ${feedback.trim()}`;

    const { error: updErr } = await sb
      .from(tableName)
      .update({ [column]: newValue, updated_at: new Date().toISOString() })
      .eq("id", current.id);
    if (updErr) throw updErr;

    res.status(200).json({ ok: true, totalLength: newValue.length });
  } catch (err) {
    console.error("save-feedback error:", err.message);
    res.status(500).json({ error: err.message });
  }
}
