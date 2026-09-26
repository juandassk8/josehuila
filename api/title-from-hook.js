import { createClient } from "./_lib/database-client.js";
import { requireCompanyAccess, sendAuthError } from "./_lib/auth.js";

export const config = {
  api: { bodyParser: { sizeLimit: "2mb" } },
  maxDuration: 30,
};

// Mismo patrón de bypass que /api/generate-script.js: team admins/reviewers
// no consumen rate limit. Si falla la validación, no bypass.
async function detectTeamBypass(req, sb) {
  try {
    const authHeader = req.headers?.authorization || req.headers?.Authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) return false;
    const jwt = authHeader.slice(7).trim();
    if (!jwt) return false;
    const anonKey = process.env.BACKEND_ANON_KEY;
    const anon = createClient(process.env.BACKEND_URL, anonKey);
    const { data: userRes, error } = await anon.auth.getUser(jwt);
    if (error || !userRes?.user) return false;
    const user = userRes.user;
    let { data: tm } = await sb
      .from("team_members")
      .select("id, role, is_reviewer")
      .eq("id", user.id)
      .maybeSingle();
    if (!tm && user.email) {
      const r = await sb
        .from("team_members")
        .select("id, role, is_reviewer")
        .ilike("email", user.email)
        .maybeSingle();
      tm = r.data;
    }
    if (!tm) return false;
    return tm.role === "admin" || tm.is_reviewer === true;
  } catch {
    return false;
  }
}

// Extrae solo la sección HOOKS del guion para mandarle menos texto al LLM.
// Si no la encuentra, devuelve los primeros ~2000 chars.
function extractHooksSection(content) {
  if (!content) return "";
  const m = content.match(/#{1,3}\s*HOOKS?[\s\S]*?(?=#{1,3}\s*(?:BODY|CTA)|$)/i);
  if (m) return m[0].slice(0, 2000);
  return content.slice(0, 2000);
}

const TITLE_SYSTEM = `Sos un titulador de guiones para una herramienta interna.
Te paso un guion (o solo su sección HOOKS) y devolvés UN ÚNICO título.

REGLAS NO NEGOCIABLES:
1. FRASE COMPLETA Y CERRADA. El título tiene que ser una idea que se entiende leída sola. PROHIBIDO terminar mid-palabra (ej: "su tumba en e"), terminar en preposición (en, de, con, por, para, sobre, entre, a), o cortar la idea.
2. Largo: entre 4 y 9 palabras. Priorizá QUE LA FRASE CIERRE sobre el conteo. Mejor 9 palabras completas que 7 cortadas.
3. Sin comillas, sin emojis, sin prefijos como "Guion:" o "Título:", sin asteriscos, sin corchetes, sin punto final.
4. Tomá la idea central del Hook 1 y comprimila a un titular escaneable.
5. Que el lector entienda DE QUÉ trata el guion con solo leerlo.
6. PROHIBIDO devolver identificadores internos tipo "Comentario #2", "UGC #4", "B-Roll con voz IA #3", "Pantalla verde #1", "Texto #5" o cualquier formato del estilo "<formato> #<número>". Esos son nombres autogenerados de slot — IGNORALOS y derivá el título del contenido del Hook 1.

Ejemplos del estilo deseado (frases cerradas):
- "El águila que vivió como gallina"
- "Por qué Apple ganó con el iPhone 4"
- "Lo que nadie te dice del bronceado"
- "Cómo Steve Jobs salvó a Pixar"
- "El error que casi quiebra a Nike"

Devolvé SOLO el título plano. Nada más.`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { companyId, memberId, scriptId, content } = req.body || {};

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  }
  if (!process.env.BACKEND_URL || !process.env.BACKEND_SERVICE_KEY) {
    return res.status(500).json({ error: "Supabase env vars not configured" });
  }

  // AUTH: antes validaba el JWT solo para el bypass de rate-limit, pero NO
  // exigía que el caller fuera dueño de companyId. Ahora sí: JWT válido con
  // acceso a companyId (o team Inforce si companyId es null → team mode).
  try {
    await requireCompanyAccess(req, companyId);
  } catch (err) {
    return sendAuthError(res, err);
  }

  const sb = createClient(process.env.BACKEND_URL, process.env.BACKEND_SERVICE_KEY);

  let scriptContent = content;
  // Si nos mandan solo scriptId, cargamos el generated_content desde DB.
  if (!scriptContent && scriptId) {
    // El guion debe ser de la empresa a la que el caller demostró tener acceso. Sin companyId
    // (modo equipo Inforce, ya validado arriba) no se restringe.
    let q = sb.from("company_scripts").select("generated_content, company_id").eq("id", scriptId);
    if (companyId) q = q.eq("company_id", companyId);
    const { data, error } = await q.maybeSingle();
    if (error || !data) {
      return res.status(404).json({ error: "script not found" });
    }
    scriptContent = data.generated_content;
  }

  if (!scriptContent || typeof scriptContent !== "string") {
    return res.status(400).json({ error: "missing content" });
  }

  const userText = extractHooksSection(scriptContent);
  if (!userText.trim()) {
    return res.status(400).json({ error: "empty content" });
  }

  const bypassRateLimit = await detectTeamBypass(req, sb);

  try {
    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 120,
        thinking: { type: "disabled" },
        output_config: { effort: "low" },
        system: TITLE_SYSTEM,
        messages: [{ role: "user", content: userText }],
      }),
    });

    if (!aiRes.ok) {
      const errData = await aiRes.json().catch(() => ({}));
      console.error("title-from-hook anthropic error:", JSON.stringify(errData));
      return res.status(aiRes.status).json({ error: errData?.error?.message || "anthropic error" });
    }

    const payload = await aiRes.json();
    const raw = payload?.content?.[0]?.text || "";
    let title = raw.trim().split("\n")[0].trim();
    title = title.replace(/^["'`*]+|["'`*]+$/g, "").trim();
    title = title.replace(/^(?:t[íi]tulo|guion)\s*[:\-–]\s*/i, "").trim();
    title = title.replace(/[.,;]+$/, "").trim();
    title = title.slice(0, 80);

    if (!title) {
      return res.status(500).json({ error: "empty title from model" });
    }

    // Log de tokens en company_token_usage (mismo patrón que generate-script).
    // Si el invocador es team admin con bypass, no logueamos para no contar
    // contra la empresa (consistente con el bypass de rate limit).
    const usage = payload?.usage || {};
    if (companyId && !bypassRateLimit) {
      const totalInput = (usage.input_tokens || 0)
        + (usage.cache_creation_input_tokens || 0)
        + (usage.cache_read_input_tokens || 0);
      try {
        await sb.from("company_token_usage").insert({
          company_id: companyId,
          member_id: memberId || null,
          input_tokens: totalInput,
          output_tokens: usage.output_tokens || 0,
          model: "claude-sonnet-4-6",
          context: { purpose: "title", scriptId: scriptId || null },
        });
      } catch (logErr) {
        console.error("[title-from-hook] logUsage failed:", logErr?.message || logErr);
      }
    }

    return res.status(200).json({ title });
  } catch (err) {
    console.error("title-from-hook error:", err?.message || err);
    return res.status(500).json({ error: err?.message || "unknown error" });
  }
}
