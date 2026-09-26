import { requireKnownUser, sendAuthError } from "./_lib/auth.js";
import { permitido } from "./_lib/throttle.js";

export const config = {
  api: { bodyParser: { sizeLimit: "20mb" } },
  maxDuration: 60,
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  // AUTH: antes NO tenía auth → proxy gratis a Claude. El caller no manda
  // companyId, así que exigimos al menos usuario autenticado (admin o cliente).
  try {
    // Solo equipo o usuarios de alguna empresa (una cuenta suelta no pasa), y con tope por usuario.
    const caller = await requireKnownUser(req);
    if (!permitido(`extract-knowledge:${caller.id}`, { max: 30, ventanaMs: 10 * 60 * 1000 })) {
      return res.status(429).json({ error: "Demasiadas solicitudes seguidas. Espera unos minutos." });
    }
  } catch (err) {
    return sendAuthError(res, err);
  }

  const { content, category, isCompanyWorkspace } = req.body;

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  }

  if (!content?.trim()) {
    return res.status(400).json({ error: "Content is required" });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        thinking: { type: "disabled" },
        output_config: { effort: "low" },
        system: isCompanyWorkspace
          ? `Eres un asistente que extrae conocimiento clave de un documento proporcionado por un negocio (un cliente). NO sabés de qué empresa es — sólo extraé lo que dice el documento, sin contexto externo.

Tu tarea: extraer el CONOCIMIENTO CONCRETO del texto: datos, productos, ofertas, precios, plazos, beneficios, modalidades, frameworks, opiniones del autor, diferenciadores. NO resumas — extrae hechos.

Formato de salida:
- Puntos clave, uno por línea
- Datos específicos (números, métricas, resultados, precios, plazos)
- Productos / servicios mencionados con sus características
- Diferenciadores o claims únicos del negocio
- Modalidades de pago / entrega / acceso
- Tono o estilo de comunicación si es notorio

Categoría del documento: ${category || "general"}

REGLAS CRÍTICAS:
- NUNCA menciones nombres de otras empresas, agencias o personas que NO estén explícitamente en el texto del documento. No inventes contexto.
- NO uses los nombres "Inforce", "Inforce Consulting", "José Manuel Huila" — esos no son del cliente.
- Sé conciso pero completo. No agregues opiniones propias.`
          : `Eres un asistente que extrae conocimiento clave de textos proporcionados por José Manuel Huila, fundador de Inforce Consulting (agencia de Facebook Ads y e-commerce en Colombia).

Tu tarea: dado un texto (guion, transcripción, documento), extraer el CONOCIMIENTO CONCRETO que contiene. No resumas el texto — extrae los datos, estrategias, frameworks, números, opiniones y expertise que José Manuel demuestra.

Formato de salida:
- Puntos clave de conocimiento, uno por línea
- Datos específicos (números, métricas, resultados)
- Estrategias o frameworks que menciona
- Opiniones fuertes o contraintuitivas

Categoría del documento: ${category || "general"}

Sé conciso pero completo. No agregues opiniones propias.`,
        messages: [{ role: "user", content: content.trim() }],
      }),
    });

    if (!response.ok) {
      const errData = await response.json();
      return res.status(response.status).json(errData);
    }

    const data = await response.json();
    const extracted = data.content?.[0]?.text || "";

    res.status(200).json({ extracted });
  } catch (err) {
    console.error("extract-knowledge error:", err.message);
    res.status(500).json({ error: err.message });
  }
}
