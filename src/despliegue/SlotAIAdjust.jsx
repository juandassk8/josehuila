import { useState, useCallback } from "react";
import { DS, darkInput, darkBtn, darkBtnGhost } from "../lib/design.js";
import { buildApiHeaders } from "../lib/apiAuth.js";

// AI Adjust adaptado a SlotModal del despliegue creativo. A diferencia del
// AIAdjustPopup de guiones (que trabaja con HTML del RichEditor), acá el
// guión es texto plano dentro de un <textarea>, así que devolvemos
// markdown limpio listo para guardar en `script_body`.
//
// Props:
//   currentContent     — string actual del textarea (markdown / texto plano)
//   idea               — título del slot, sirve de contexto al modelo
//   formatId           — opcional, si el slot lo tiene
//   initialInstruction — para el flujo "Acortar con IA" precargado desde
//                        el pill de duración. Default: "".
//   onApply(newText)   — recibe el guión actualizado en markdown.
//   onClose            — cierra el modal.

export function SlotAIAdjust({ currentContent, idea, formatId, initialInstruction = "", onApply, onClose }) {
  const [instruction, setInstruction] = useState(initialInstruction);
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState("");
  const [error, setError] = useState("");

  const parseSSE = useCallback(async (response, onText) => {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);
        if (data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === "content_block_delta" && parsed.delta?.text) {
            fullText += parsed.delta.text;
            onText(fullText);
          }
        } catch {}
      }
    }
    return fullText;
  }, []);

  // Para el caso en que el modelo responda con HTML (cuando interpreta el
  // contexto como editor rich), lo bajamos a markdown plano. Si ya viene
  // como `## HOOKS` lo devolvemos tal cual.
  const htmlToMarkdown = (html) => {
    if (!html) return "";
    if (html.startsWith("## ") || !html.includes("<")) return html;
    return html
      .replace(/<h2[^>]*>/gi, "\n## ")
      .replace(/<\/h2>/gi, "\n")
      .replace(/<h3[^>]*>/gi, "\n### ")
      .replace(/<\/h3>/gi, "\n")
      .replace(/<strong>/gi, "**")
      .replace(/<\/strong>/gi, "**")
      .replace(/<em>/gi, "*")
      .replace(/<\/em>/gi, "*")
      .replace(/<p[^>]*>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  };

  // El textarea del SlotModal es plano (sin rich editor), así que el
  // markdown crudo (## HOOKS, **Hook 1:**) se ve "tal cual" y queda sucio.
  // Limpiamos los marcadores de heading y bold dejando solo el texto —
  // el contenido sigue siendo legible y sin asteriscos ni numerales.
  const cleanMarkdownForTextarea = (md) => {
    if (!md) return "";
    return md
      // Quitar prefijo de heading: "## HOOKS" → "HOOKS"
      .replace(/^#{1,6}\s+/gm, "")
      // Quitar bold: "**Hook 1:**" → "Hook 1:"
      .replace(/\*\*([^*\n]+)\*\*/g, "$1")
      // Quitar italic suelto: "*texto*" → "texto"
      .replace(/(^|[^\*])\*([^*\n]+)\*(?!\*)/g, "$1$2")
      // Quitar inline code
      .replace(/`([^`\n]+)`/g, "$1")
      // Asteriscos huérfanos sueltos al inicio/fin de línea
      .replace(/^\s*\*+\s*$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  };

  const apply = async () => {
    if (!instruction.trim() || loading) return;
    setLoading(true);
    setError("");
    setStreaming("");

    try {
      const currentMarkdown = (currentContent || "").trim();

      const res = await fetch("/api/generate-script", {
        method: "POST",
        headers: await buildApiHeaders(),
        body: JSON.stringify({
          formatId: formatId || null,
          idea: idea || "Guion",
          chatHistory: [
            { role: "user", content: `Aqui esta el guion actual:\n\n${currentMarkdown}` },
            { role: "assistant", content: currentMarkdown },
            {
              role: "user",
              content: `Aplica este ajuste al guion: ${instruction.trim()}\n\nDevuelve el guion COMPLETO actualizado usando exactamente el formato HOOKS/BODY/CTA:\n\n## HOOKS\n**Hook 1:** ...\n**Hook 2:** ...\n\n## BODY\n...\n\n## CTA\n...\n\nNO respondas con preguntas ni explicaciones. Solo el guion completo actualizado.`,
            },
          ],
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(`Error: ${err.error?.message || err.error || "No se pudo ajustar el guion"}`);
        setLoading(false);
        return;
      }

      const fullText = await parseSSE(res, setStreaming);
      const newText = cleanMarkdownForTextarea(htmlToMarkdown(fullText));
      onApply(newText, instruction.trim());
      setLoading(false);
      onClose();
    } catch (err) {
      setError(`Error: ${err.message}`);
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1100,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)", fontFamily: DS.font,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: DS.bgSide, border: DS.border, borderRadius: 16,
          padding: 24, width: 580, maxHeight: "85vh", overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 18 }}>✨</span>
          <div style={{ fontSize: 16, fontWeight: 700, color: DS.textPrimary }}>Ajustar con IA</div>
        </div>
        <div style={{ fontSize: 12, color: DS.textSecondary, marginBottom: 18 }}>
          Escribí qué cambio querés en el guion. La IA va a devolver el guion completo actualizado y reemplazar el actual.
        </div>

        <textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder={'Ej: "Hacelo más corto", "Cambiá el hook 2 para que arranque con un dato", "Agregá un CTA a DM al final"'}
          rows={5}
          autoFocus
          disabled={loading}
          style={{
            ...darkInput,
            resize: "vertical", lineHeight: 1.5,
            marginBottom: 10, fontSize: 13,
          }}
        />

        {loading && streaming && (
          <div style={{
            padding: 12, borderRadius: 8,
            background: DS.bgCard, border: DS.border,
            marginBottom: 10, maxHeight: 240, overflowY: "auto",
            fontSize: 12, color: DS.textSecondary, lineHeight: 1.5,
            whiteSpace: "pre-wrap",
          }}>
            {cleanMarkdownForTextarea(streaming)}
          </div>
        )}

        {error && <div style={{ color: DS.red, fontSize: 12, marginBottom: 10 }}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
          <button onClick={onClose} disabled={loading} style={darkBtnGhost}>Cancelar</button>
          <button
            onClick={apply}
            disabled={!instruction.trim() || loading}
            style={{ ...darkBtn, opacity: !instruction.trim() || loading ? 0.4 : 1 }}
          >
            {loading ? "Ajustando…" : "✨ Ajustar"}
          </button>
        </div>
      </div>
    </div>
  );
}
