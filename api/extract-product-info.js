// Extrae información del producto desde un archivo (PDF o texto de XLSX/TXT).
// Usa Claude para mapear campos a las preguntas del nicho seleccionado.
// Lo que no encaje en las preguntas específicas se devuelve como `context`.

import { requireKnownUser, sendAuthError } from "./_lib/auth.js";
import { permitido } from "./_lib/throttle.js";

export const config = {
  api: { bodyParser: { sizeLimit: "25mb" } },
  maxDuration: 60,
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  // AUTH: antes NO tenía auth → proxy gratis a Claude. El caller no manda
  // companyId, así que exigimos al menos usuario autenticado (admin o cliente).
  try {
    // Solo equipo o usuarios de alguna empresa (una cuenta suelta no pasa), y con tope por usuario.
    const caller = await requireKnownUser(req);
    if (!permitido(`extract-product-info:${caller.id}`, { max: 30, ventanaMs: 10 * 60 * 1000 })) {
      return res.status(429).json({ error: "Demasiadas solicitudes seguidas. Espera unos minutos." });
    }
  } catch (err) {
    return sendAuthError(res, err);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  }

  const {
    fileBase64,       // opcional, sólo para PDF
    textContent,      // opcional, XLSX/TXT/MD ya extraído a texto
    fileName,
    mimeType,         // "application/pdf" | "text/plain" | …
    niche,            // slug del nicho seleccionado (o null)
    questions = [],   // [{ key, label }]
    currentFields = {}, // campos ya llenos en el formulario — no los sobreescribimos vacíos
    currentName = "",   // nombre actual del producto (puede venir vacío)
    currentContext = "", // contexto actual
  } = req.body || {};

  if (!fileBase64 && !textContent) {
    return res.status(400).json({ error: "Se requiere fileBase64 (PDF) o textContent (texto extraído)." });
  }

  const qList = Array.isArray(questions) ? questions : [];
  const questionsSection = qList.length
    ? qList.map((q) => `- "${q.key}" → ${q.label}`).join("\n")
    : "(no hay preguntas específicas — llená sólo el nombre y el contexto)";

  const systemPrompt = `Eres un asistente que extrae información de productos desde documentos (PDFs, hojas de cálculo, archivos de texto) para alimentar el contexto de un generador de guiones publicitarios.

Tu tarea: leer el documento y devolver un JSON con la información del producto, mapeada a los campos que te indica el formulario.

NICHO DEL NEGOCIO: ${niche || "(no definido)"}

CAMPOS DEL FORMULARIO A LLENAR (usá la key exacta como nombre de propiedad en fields):
${questionsSection}

REGLAS:
1. Extraé SÓLO información que esté explícita o fuertemente implícita en el documento. No inventes.
2. Si un campo no tiene información en el documento, omitilo del objeto "fields" (NO devuelvas string vacío).
3. Respetá el idioma del documento original (típicamente español).
4. Si encontrás información relevante que NO encaja en ninguna pregunta específica (claims legales, reglas de tono, datos técnicos, contexto histórico, etc.), agregalo como texto en "context".
5. Si el documento sugiere un nombre de producto y el usuario aún no puso nombre, devolvelo en "name".
6. "context" es texto plano (puede tener saltos de línea y bullets "- "). Máximo ~400 palabras.
7. Si el documento es una hoja de cálculo con varios productos, enfocate en UNO (el primero si no hay más contexto) y mencioná en "context" que hay más productos en el documento.

Devolvé EXCLUSIVAMENTE un JSON válido con esta forma (sin markdown, sin \`\`\`json, sin texto extra):
{
  "name": "<nombre sugerido o cadena vacía>",
  "fields": { "<key>": "<valor>", ... },
  "context": "<notas adicionales>"
}`;

  // Construimos el contenido del mensaje. Si hay PDF base64 usamos el document
  // block nativo de Claude; si hay texto plano lo mandamos como texto.
  const userContent = [];
  if (fileBase64 && (mimeType === "application/pdf" || /\.pdf$/i.test(fileName || ""))) {
    userContent.push({
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: fileBase64,
      },
    });
  }
  if (textContent && textContent.trim()) {
    userContent.push({
      type: "text",
      text: `Archivo: ${fileName || "(sin nombre)"}\nContenido extraído:\n\n${textContent}`,
    });
  }

  // Contexto actual del formulario (opcional — para que Claude no duplique lo ya escrito).
  const currentNonEmpty = Object.entries(currentFields).filter(([, v]) => v && String(v).trim());
  if (currentName || currentNonEmpty.length || currentContext) {
    const already = [
      currentName ? `- name: ${currentName}` : null,
      ...currentNonEmpty.map(([k, v]) => `- ${k}: ${v}`),
      currentContext ? `- context: ${currentContext}` : null,
    ].filter(Boolean).join("\n");
    userContent.push({
      type: "text",
      text: `Campos ya llenos por el usuario (complementá lo vacío, no los sobrescribas):\n${already}`,
    });
  }

  if (userContent.length === 0) {
    return res.status(400).json({ error: "Contenido vacío." });
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
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 3000,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      let errBody;
      try { errBody = JSON.parse(errText); } catch { errBody = { raw: errText }; }
      console.error("extract-product-info upstream error:", response.status, errBody);
      return res.status(response.status).json(errBody);
    }

    const data = await response.json();
    const raw = data.content?.[0]?.text || "";

    // Intentamos parsear el JSON. Si Claude metió un fence, lo quitamos.
    let parsed;
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Fallback: si no parsea, devolvemos todo como context.
      parsed = { name: "", fields: {}, context: raw };
    }

    // Normalización defensiva.
    const out = {
      name: typeof parsed.name === "string" ? parsed.name.trim() : "",
      fields: (parsed.fields && typeof parsed.fields === "object") ? parsed.fields : {},
      context: typeof parsed.context === "string" ? parsed.context.trim() : "",
    };

    res.status(200).json(out);
  } catch (err) {
    console.error("extract-product-info error:", err);
    res.status(500).json({ error: err?.message || String(err) });
  }
}
