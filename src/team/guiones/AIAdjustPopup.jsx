import { useState, useCallback, useEffect } from "react";
import { DS, darkInput, darkBtn, darkBtnGhost } from "../../lib/design.js";
import { scriptMarkdownToHtml } from "../../lib/scriptToHtml.js";
import { buildApiHeaders } from "../../lib/apiAuth.js";

// Trigger phrases that auto-detect "save this permanently"
const SAVE_TRIGGERS = [
  /guarda\s+(esto|lo siguiente)/i,
  /recuerda\s+que/i,
  /ten en cuenta/i,
  /siempre\s+(haz|debes|tienes que)/i,
  /nunca\s+(uses|utilices|digas)/i,
  /no\s+(uses|utilices|digas)/i,
  /a\s+partir\s+de\s+ahora/i,
  /para\s+próximos\s+guiones/i,
  /para\s+futuros\s+guiones/i,
];

function detectSaveIntent(text) {
  return SAVE_TRIGGERS.some((re) => re.test(text));
}

export function AIAdjustPopup({ currentContentHtml, formatId, idea, onApply, onClose, initialInstruction = "" }) {
  const [instruction, setInstruction] = useState(initialInstruction);
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState("");
  const [error, setError] = useState("");
  const [saveToMemory, setSaveToMemory] = useState(false);

  // Auto-detect save intent when user types
  useEffect(() => {
    if (detectSaveIntent(instruction)) {
      setSaveToMemory(true);
    }
  }, [instruction]);

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

  const apply = async () => {
    if (!instruction.trim() || loading) return;
    setLoading(true);
    setError("");
    setStreaming("");

    try {
      // If user wants to save this as a rule, save it first
      if (saveToMemory) {
        await fetch("/api/save-feedback", {
          method: "POST",
          headers: await buildApiHeaders(),
          body: JSON.stringify({ feedback: instruction.trim() }),
        });
      }

      const currentMarkdown = htmlToMarkdown(currentContentHtml);

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
        const err = await res.json();
        setError(`Error: ${err.error?.message || err.error || "Error desconocido"}`);
        setLoading(false);
        return;
      }

      const fullText = await parseSSE(res, setStreaming);
      const newHtml = scriptMarkdownToHtml(fullText);
      onApply(newHtml, instruction.trim());
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
        position: "fixed", inset: 0, zIndex: 1000,
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
          Escribe que cambio quieres en el guion. La IA va a devolver el guion completo actualizado.
        </div>

        <textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder={'Ej: "Cambia el hook 2 para que arranque con un dato", "Guarda esto: nunca uses la palabra marca", "Recuerda que siempre termino con un CTA a DM"'}
          rows={5}
          autoFocus
          disabled={loading}
          style={{
            ...darkInput,
            resize: "vertical", lineHeight: 1.5,
            marginBottom: 8, fontSize: 13,
          }}
        />

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          <button
            type="button"
            disabled={loading}
            onClick={() => setInstruction(
              "Reescribí el guion COMPLETO desde cero respetando ESTRICTAMENTE toda la base de expertise actualizada: " +
              "voice profile, productos, prohibiciones (lo que nunca dice ni haría), reglas aprendidas y documentos cargados. " +
              "Si el guion actual contiene palabras, frases o temas prohibidos, eliminalos y reformulá con alternativas que cumplan las reglas. " +
              "Mantené el concepto, el ángulo y la idea principal — pero asegurate de que cada frase del nuevo guion respete TODAS las reglas de la marca. " +
              "Devolvé el guion completo en formato HOOKS / BODY / CTA."
            )}
            style={{
              padding: "6px 11px", borderRadius: 50,
              border: `1px solid ${DS.purple}55`,
              background: `${DS.purple}10`,
              color: DS.textPrimary,
              fontSize: 11, fontWeight: 600,
              cursor: loading ? "default" : "pointer", fontFamily: DS.font,
              opacity: loading ? 0.5 : 1,
            }}
          >
            ♻ Rehacer respetando expertise
          </button>
        </div>

        {/* Save to memory toggle */}
        <label style={{
          display: "flex", alignItems: "flex-start", gap: 10,
          padding: "10px 12px", borderRadius: 10,
          background: saveToMemory ? "rgba(139,92,246,0.08)" : DS.bgCard,
          border: saveToMemory ? `1px solid ${DS.purple}55` : DS.border,
          cursor: "pointer", marginBottom: 10,
        }}>
          <input
            type="checkbox"
            checked={saveToMemory}
            onChange={(e) => setSaveToMemory(e.target.checked)}
            style={{ marginTop: 2 }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: DS.textPrimary, display: "flex", alignItems: "center", gap: 6 }}>
              💾 Guardar en memoria permanente
            </div>
            <div style={{ fontSize: 11, color: DS.textSecondary, marginTop: 2 }}>
              Si activas esto, el feedback se guarda y se aplicará a TODOS los guiones futuros.
              Se auto-detecta cuando escribes "guarda esto", "recuerda que", "nunca uses", etc.
            </div>
          </div>
        </label>

        {loading && streaming && (
          <div style={{
            padding: 12, borderRadius: 8,
            background: DS.bgCard, border: DS.border,
            marginBottom: 10, maxHeight: 200, overflowY: "auto",
            fontSize: 12, color: DS.textSecondary, lineHeight: 1.5,
            whiteSpace: "pre-wrap",
          }}>
            {streaming}
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
            {loading ? "Ajustando..." : (saveToMemory ? "✨ Ajustar y guardar" : "✨ Ajustar")}
          </button>
        </div>
      </div>
    </div>
  );
}
