import { createClient } from "./_lib/database-client.js";
import { requireCompanyAccess, sendAuthError } from "./_lib/auth.js";

export const config = {
  api: { bodyParser: { sizeLimit: "5mb" } },
  maxDuration: 60,
};

// Voice Learning Loop — Compara el AI draft original con el final aprobado
// por el usuario, extrae patrones de edición, y los acumula en
// accumulated_feedback (que se inyecta en futuros system prompts).
//
// Input:
//   { companyId? (workspace cliente) | null (team Jose), aiDraft, userFinal,
//     scriptTitle?, formatName?, productName? }
//
// Output:
//   { ok: true, patternsExtracted: <texto>, accumulatedAfter: <texto> }
//
// El llamado es idempotente — si los textos son casi iguales (<20% de diff)
// no llama al LLM y devuelve { ok: true, skipped: "no significant edits" }.

function htmlToText(html) {
  if (!html) return "";
  return String(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
    .replace(/<\/h[1-6]>\s*/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Heurística simple: % de diferencia entre dos strings (basado en longitud).
// Para ahorro de tokens — si el user solo cambió 2 palabras, no vale la pena
// pagarle a Claude para extraer patrones.
function diffRatio(a, b) {
  if (!a || !b) return 1;
  const la = a.length;
  const lb = b.length;
  if (la === 0 && lb === 0) return 0;
  const minLen = Math.min(la, lb);
  const maxLen = Math.max(la, lb);
  // Aproximación: si la longitud difiere mucho, es edit grande
  const lenRatio = (maxLen - minLen) / maxLen;
  // Si las longitudes son similares pero el contenido diferente, comparar
  // chars match. Esto NO es Levenshtein (sería caro) — es proxy.
  let matchCount = 0;
  for (let i = 0; i < minLen; i++) {
    if (a[i] === b[i]) matchCount++;
  }
  const charRatio = 1 - (matchCount / minLen);
  return Math.max(lenRatio, charRatio * 0.5);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { companyId, aiDraft, userFinal, scriptTitle, formatName, productName } = req.body;

  if (!process.env.ANTHROPIC_API_KEY || !process.env.BACKEND_URL || !process.env.BACKEND_SERVICE_KEY) {
    return res.status(500).json({ error: "env vars not configured" });
  }
  if (!aiDraft || !userFinal) {
    return res.status(400).json({ error: "aiDraft and userFinal required" });
  }

  // AUTH: antes solo validaba que hubiera texto — corría el LLM + escribía
  // company_voice_profile sin verificar dueño. Exigimos que el caller pueda
  // acceder a companyId (o sea team Inforce si companyId es null → team mode).
  try {
    await requireCompanyAccess(req, companyId);
  } catch (err) {
    return sendAuthError(res, err);
  }

  const draftTxt = htmlToText(aiDraft);
  const finalTxt = htmlToText(userFinal);

  // Skip si los cambios son mínimos — no vale la pena gastar tokens.
  const ratio = diffRatio(draftTxt, finalTxt);
  if (ratio < 0.20) {
    return res.status(200).json({ ok: true, skipped: "edits below 20% threshold", ratio });
  }

  const sb = createClient(process.env.BACKEND_URL, process.env.BACKEND_SERVICE_KEY);

  // Cargar accumulated_feedback existente (para que Claude lo extienda en
  // vez de empezar de cero).
  const voiceTable = companyId ? "company_voice_profile" : "voice_profile";
  const filter = companyId ? { company_id: companyId } : null;
  let existingAccum = "";
  try {
    let q = sb.from(voiceTable).select("accumulated_feedback");
    if (filter) q = q.eq("company_id", companyId);
    const { data } = await q.maybeSingle();
    existingAccum = data?.accumulated_feedback || "";
  } catch (e) {
    console.warn("[extract-voice-patterns] could not load existing accum:", e?.message);
  }

  const systemPrompt = `Eres un analista del estilo de escritura de un usuario. Te paso DOS versiones del mismo guion:
1. AI_DRAFT = lo que la IA generó originalmente.
2. USER_FINAL = lo que el usuario terminó aprobando después de editar manualmente.

Tu trabajo: identificar PATRONES de edición — qué tipo de cambios el usuario hace consistentemente. Esto sirve para que la próxima generación de guiones sea más cercana a lo que el usuario realmente quiere, sin tener que editarla tanto.

REGLAS:
- Extraé MÁXIMO 5 patrones nuevos por análisis. Patrones específicos y accionables.
- Cada patrón = una sentencia clara: "El usuario [acción] [contexto]".
- NO repitas patrones que ya están en REGLAS_PREVIAS — solo agregá NUEVAS observaciones.
- Si los cambios son superficiales (puntuación, typos), respondé "SIN_PATRONES_NUEVOS".
- Concentrate en: vocabulario que reemplaza, estructura que prefiere, tono que ajusta, partes que borra/agrega siempre, longitud preferida.

REGLAS_PREVIAS (lo que ya aprendimos antes — no las repitas):
${existingAccum || "(ninguna todavía)"}

CONTEXTO DEL GUION ACTUAL:
- Título: ${scriptTitle || "(sin título)"}
- Formato/Concepto: ${formatName || "(libre)"}
- Producto: ${productName || "(no especificado)"}

FORMATO DE SALIDA:
Si hay patrones nuevos:
- [patrón 1]
- [patrón 2]
...

Si no hay patrones nuevos significativos:
SIN_PATRONES_NUEVOS`;

  const userMsg = `# AI_DRAFT\n\n${draftTxt}\n\n---\n\n# USER_FINAL\n\n${finalTxt}`;

  // Llamar a Claude (no streaming — esperamos respuesta corta)
  let analysisText = "";
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001", // Haiku para extraction — barato + rápido
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: userMsg }],
      }),
    });
    if (!resp.ok) {
      const err = await resp.json();
      console.error("[extract-voice-patterns] Anthropic error:", err);
      return res.status(500).json({ error: "Anthropic API failed", detail: err });
    }
    const data = await resp.json();
    analysisText = data.content?.[0]?.text?.trim() || "";

    // Log token usage si hay companyId (mismo bucket de tokens del Guionista)
    if (companyId && data.usage) {
      try {
        await sb.from("company_token_usage").insert({
          company_id: companyId,
          input_tokens: (data.usage.input_tokens || 0) + (data.usage.cache_read_input_tokens || 0),
          output_tokens: data.usage.output_tokens || 0,
          model: "claude-haiku-4-5-20251001",
          context: { kind: "voice_pattern_extraction" },
        });
      } catch { /* fail-silent — log no es crítico */ }
    }
  } catch (e) {
    console.error("[extract-voice-patterns] failed:", e);
    return res.status(500).json({ error: e.message });
  }

  // Si Claude dice "sin patrones nuevos" o respuesta vacía, no actualizar.
  if (!analysisText || /sin_patrones_nuevos/i.test(analysisText)) {
    return res.status(200).json({ ok: true, skipped: "no new patterns extracted" });
  }

  // Merge: append los patrones nuevos al accumulated_feedback existente.
  // Tope de longitud para que no crezca infinito (3000 chars máx ~ 800 tokens).
  const MAX_ACCUM_LEN = 3000;
  const today = new Date().toISOString().split("T")[0];
  const newBlock = `\n\n--- ${today} ---\n${analysisText}`;
  let merged = (existingAccum + newBlock).trim();
  if (merged.length > MAX_ACCUM_LEN) {
    // Trimear desde el principio (los patrones más viejos pueden quedar
    // sub-representados, pero los más recientes son los más relevantes).
    merged = "..." + merged.slice(merged.length - MAX_ACCUM_LEN);
  }

  // Persistir
  try {
    if (companyId) {
      await sb.from("company_voice_profile")
        .upsert({ company_id: companyId, accumulated_feedback: merged, updated_at: new Date().toISOString() },
          { onConflict: "company_id" });
    } else {
      // Team mode: hay UNA fila (limit 1) en voice_profile
      const { data: existing } = await sb.from("voice_profile").select("id").limit(1).maybeSingle();
      if (existing?.id) {
        await sb.from("voice_profile")
          .update({ accumulated_feedback: merged })
          .eq("id", existing.id);
      } else {
        await sb.from("voice_profile").insert({ accumulated_feedback: merged });
      }
    }
  } catch (e) {
    console.error("[extract-voice-patterns] persist failed:", e);
    return res.status(500).json({ error: "could not persist patterns", detail: e.message });
  }

  return res.status(200).json({ ok: true, patternsExtracted: analysisText, accumulatedAfter: merged });
}
