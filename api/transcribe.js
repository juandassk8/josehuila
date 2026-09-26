import { requireKnownUser, sendAuthError } from "./_lib/auth.js";
import { permitido } from "./_lib/throttle.js";

export const config = {
  api: { bodyParser: false },
  maxDuration: 60,
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  // AUTH: antes NO tenía auth → cualquiera podía quemar la key de Whisper.
  // No es company-scoped; exigimos usuario autenticado (admin o cliente).
  try {
    // Solo equipo o usuarios de alguna empresa (una cuenta suelta no pasa), y con tope por usuario.
    const caller = await requireKnownUser(req);
    if (!permitido(`transcribe:${caller.id}`, { max: 40, ventanaMs: 10 * 60 * 1000 })) {
      return res.status(429).json({ error: "Demasiadas solicitudes seguidas. Espera unos minutos." });
    }
  } catch (err) {
    return sendAuthError(res, err);
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "OPENAI_API_KEY not configured" });
  }

  try {
    // Read raw request body
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks);

    // Extract file from multipart body
    const contentType = req.headers["content-type"] || "";
    const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^\s;]+))/);
    if (!boundaryMatch) {
      return res.status(400).json({ error: "Missing multipart boundary" });
    }
    const boundary = boundaryMatch[1] || boundaryMatch[2];
    const boundaryBuf = Buffer.from(`--${boundary}`);

    // Find parts by splitting on boundary
    const parts = [];
    let start = 0;
    while (true) {
      const idx = rawBody.indexOf(boundaryBuf, start);
      if (idx === -1) break;
      if (start > 0) {
        parts.push(rawBody.slice(start, idx));
      }
      start = idx + boundaryBuf.length;
      // Skip \r\n after boundary
      if (rawBody[start] === 0x0d && rawBody[start + 1] === 0x0a) start += 2;
    }

    let fileData = null;
    let fileName = "audio.mp3";

    for (const part of parts) {
      const headerEnd = part.indexOf("\r\n\r\n");
      if (headerEnd === -1) continue;
      const headerStr = part.slice(0, headerEnd).toString("utf-8");
      if (!headerStr.includes("filename=")) continue;

      const nameMatch = headerStr.match(/filename="([^"]+)"/);
      if (nameMatch) fileName = nameMatch[1];

      // File data starts after \r\n\r\n and ends before trailing \r\n
      let data = part.slice(headerEnd + 4);
      if (data.length >= 2 && data[data.length - 2] === 0x0d && data[data.length - 1] === 0x0a) {
        data = data.slice(0, -2);
      }
      fileData = data;
    }

    if (!fileData || fileData.length === 0) {
      return res.status(400).json({ error: "No audio file found in request" });
    }

    // Build FormData with native Node.js APIs
    const blob = new Blob([fileData], { type: "application/octet-stream" });
    const formData = new FormData();
    formData.append("file", blob, fileName);
    formData.append("model", "whisper-1");
    formData.append("language", "es");

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Whisper error:", errText);
      try {
        return res.status(response.status).json(JSON.parse(errText));
      } catch {
        return res.status(response.status).json({ error: errText });
      }
    }

    const data = await response.json();
    res.status(200).json({ text: data.text });
  } catch (err) {
    console.error("transcribe error:", err.message);
    res.status(500).json({ error: err.message });
  }
}
