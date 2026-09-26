import { requireKnownUser, sendAuthError } from "./_lib/auth.js";
import { permitido } from "./_lib/throttle.js";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "20mb",
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  // AUTH: antes NO tenía auth → proxy gratis a Claude / DoS financiero.
  // No es company-scoped (no recibe companyId), así que exigimos al menos un
  // usuario autenticado (admin o cliente logueado con Supabase Auth).
  try {
    // Solo equipo o usuarios de alguna empresa (una cuenta suelta no pasa), y con tope por usuario.
    const caller = await requireKnownUser(req);
    if (!permitido(`ai:${caller.id}`, { max: 40, ventanaMs: 10 * 60 * 1000 })) {
      return res.status(429).json({ error: "Demasiadas solicitudes seguidas. Espera unos minutos." });
    }
  } catch (err) {
    return sendAuthError(res, err);
  }

  const { messages, systemPrompt } = req.body || {};
  // Topes duros: este endpoint es un proxy a Claude y no debe servir para pedidos gigantes.
  const maxTokens = Math.min(4000, Math.max(1, parseInt(req.body?.maxTokens, 10) || 1500));
  if (!Array.isArray(messages) || !messages.length || messages.length > 40) {
    return res.status(400).json({ error: "messages inválido" });
  }
  if (typeof systemPrompt === "string" && systemPrompt.length > 60000) {
    return res.status(400).json({ error: "systemPrompt demasiado largo" });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY not set");
    return res.status(500).json({ error: "API key not configured" });
  }

  const models = ["claude-sonnet-4-6", "claude-haiku-4-5-20251001"];

  for (const model of models) {
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          // thinking off para que Sonnet 4.6 no entre en modo adaptativo por
          // defecto (gasta más tokens). NO fijamos `effort` acá: el fallback
          // Haiku 4.5 lo rechaza con 400, pero `thinking: disabled` lo aceptan
          // ambos modelos.
          thinking: { type: "disabled" },
          system: systemPrompt,
          messages,
        }),
      });

      if (response.status === 529) {
        console.warn(`Model ${model} overloaded, trying next...`);
        continue;
      }

      const data = await response.json();

      if (!response.ok) {
        console.error("Anthropic API error:", JSON.stringify(data));
        return res.status(response.status).json(data);
      }

      return res.status(200).json(data);
    } catch (err) {
      console.error(`Error with model ${model}:`, err.message);
      continue;
    }
  }

  res.status(529).json({ error: { message: "Todos los modelos están sobrecargados. Intenta en unos minutos." } });
}
