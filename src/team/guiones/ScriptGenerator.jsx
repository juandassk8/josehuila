import { useState, useCallback, useRef, useEffect } from "react";
import { DS, darkInput, darkBtn, darkBtnGhost, darkCard } from "../../lib/design.js";
import { createScript, updateScript } from "../data/guionesDb.js";
import { updateContentItem } from "../data/contentDb.js";
import { scriptMarkdownToHtml } from "../../lib/scriptToHtml.js";
import { extractTitleFromScript, stripTitleSection } from "../../lib/scriptParse.js";
import { ScriptDurationPill } from "../../lib/ScriptDurationPill.jsx";
import { AudioUpload } from "./AudioUpload.jsx";
import { FormatSelect } from "./FormatSelect.jsx";
import { AIAdjustPopup } from "./AIAdjustPopup.jsx";
import { buildApiHeaders } from "../../lib/apiAuth.js";
import { RichEditor } from "../contenido/RichEditor.jsx";
import { logger } from "../../lib/logger.js";

// Detect if AI response is a script (contains Hook/Body structure) vs conversational answer
function isScriptResponse(text) {
  return /##\s*HOOK/i.test(text) || /##\s*BODY/i.test(text);
}

// Ensure content is HTML. If it looks like markdown, convert it.
function ensureHtml(content) {
  if (!content) return "";
  const trimmed = content.trim();
  // Already HTML if starts with a tag
  if (/^<[a-z]/i.test(trimmed)) return content;
  // Markdown with ## HOOKS → convert
  if (isScriptResponse(trimmed)) return scriptMarkdownToHtml(content);
  // Plain text → wrap in paragraph
  return content.split(/\n\n+/).map((p) => `<p>${p.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`).join("");
}

export function ScriptGenerator({ formats, selectedScript, prefillIdea, contentItems, onScriptCreated, onScriptUpdated, readOnly = false }) {
  const [idea, setIdea] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [formatId, setFormatId] = useState("");
  const [generatedText, setGeneratedText] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentScriptId, setCurrentScriptId] = useState(null);
  const [streamingText, setStreamingText] = useState("");
  const [dragging, setDragging] = useState(false);
  const [droppedFile, setDroppedFile] = useState(null);
  const [prefilled, setPrefilled] = useState(null);
  const [history, setHistory] = useState([]); // for undo/redo
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [showAdjust, setShowAdjust] = useState(false);
  // Si el usuario abre el popup desde "Acortar con IA" del pill de duración,
  // pre-cargamos la instrucción. Vuelve a vacío al cerrar.
  const [adjustPrefill, setAdjustPrefill] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);
  const saveTimerRef = useRef(null);

  // Prefill from content idea
  if (prefillIdea && prefillIdea.id !== prefilled) {
    setIdea(prefillIdea.title || "");
    setReference(prefillIdea.referencia_url || "");
    setNotes(prefillIdea.body || "");
    // Match format by name
    const ideaFormato = Array.isArray(prefillIdea.formato) ? prefillIdea.formato[0] : prefillIdea.formato;
    const matchedFormat = ideaFormato ? formats.find((f) => f.name === ideaFormato) : null;
    setFormatId(matchedFormat?.id || "");
    setGeneratedText("");
    setChatHistory([]);
    setPrefilled(prefillIdea.id);
  }

  // Load selected script into view
  const isViewing = !!selectedScript;
  const displayTitle = isViewing ? selectedScript.title : idea;
  // IMPORTANTE: prioridad `generated_content` primero. `final_content` es un
  // snapshot que se escribe al aprobar — si alguien edita post-aprobación,
  // los edits persisten en generated_content. Con la prioridad invertida
  // antes (final_content primero), los edits parecían "perdidos" porque el
  // render seguía mostrando la versión aprobada stale. Bug del 2026-04-22.
  const displayContent = isViewing
    ? selectedScript.generated_content || selectedScript.final_content
    : generatedText;
  const displayChat = isViewing ? selectedScript.chat_history || [] : chatHistory;

  const parseSSE = useCallback(async (response, onText, abortController) => {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";
    let streamError = null;
    let stopReason = null;

    // Idle timeout: si no llegan tokens nuevos en 15s, abortamos con mensaje.
    const IDLE_MS = 15000;
    let lastActivity = Date.now();
    let aborted = false;

    const idleCheck = setInterval(() => {
      if (Date.now() - lastActivity > IDLE_MS) {
        aborted = true;
        try { abortController?.abort(); } catch {}
        try { reader.cancel(); } catch {}
      }
    }, 2000);

    try {
      while (true) {
        let readResult;
        try {
          readResult = await reader.read();
        } catch (e) {
          // Reader cancelled o network error
          break;
        }
        const { done, value } = readResult;
        if (done) break;
        lastActivity = Date.now();
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
            } else if (parsed.type === "error") {
              streamError = parsed.error?.message
                || (typeof parsed.error === "string" ? parsed.error : JSON.stringify(parsed.error))
                || "Stream error";
            } else if (parsed.type === "message_delta" && parsed.delta?.stop_reason) {
              stopReason = parsed.delta.stop_reason;
            }
          } catch {
            // skip unparseable lines
          }
        }
      }
    } finally {
      clearInterval(idleCheck);
    }

    if (streamError) {
      throw new Error(streamError);
    }
    if (aborted && fullText.trim().length < 20) {
      throw new Error("Sin respuesta del modelo en 15s. Probable rate limit — espera 1 minuto y reintenta (o sube a Tier 2 en console.anthropic.com).");
    }
    if (stopReason && stopReason !== "end_turn" && stopReason !== "stop_sequence") {
      throw new Error(`Generación interrumpida (${stopReason}). ${fullText.length < 50 ? "Probable rate limit — espera 1 minuto y reintenta." : "Resultado parcial guardado."}`);
    }
    if (fullText.trim().length < 20) {
      throw new Error("Respuesta vacía del modelo. Probable rate limit — espera 1 minuto y reintenta.");
    }
    return fullText;
  }, []);

  const generate = async () => {
    if (!idea.trim()) return;
    setLoading(true);
    setGeneratedText("");
    setChatHistory([]);
    setStreamingText("");

    const abortController = new AbortController();
    try {
      const res = await fetch("/api/generate-script", {
        method: "POST",
        headers: await buildApiHeaders(),
        signal: abortController.signal,
        body: JSON.stringify({
          formatId: formatId || null,
          idea: idea.trim(),
          reference: reference.trim() || null,
          notes: notes.trim() || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        setGeneratedText(`Error: ${err.error?.message || err.error || "Unknown error"}`);
        setLoading(false);
        return;
      }

      const fullText = await parseSSE(res, setGeneratedText, abortController);

      // El LLM emite ## TÍTULO arriba del guion — lo extraemos como title del
      // script y guardamos generated_content sin esa sección.
      const aiTitle = extractTitleFromScript(fullText);
      const cleanedContent = stripTitleSection(fullText);
      if (aiTitle) setGeneratedText(cleanedContent);

      // Save to DB
      // ai_draft_content = snapshot inmutable del AI output. Nunca se sobrescribe
      // con edits del user — sirve para el voice learning loop al aprobar.
      const { data } = await createScript({
        title: aiTitle || idea.trim() || "Guion sin título",
        format_id: formatId || null,
        reference_text: reference.trim(),
        notes: notes.trim(),
        generated_content: cleanedContent,
        ai_draft_content: cleanedContent,
        chat_history: [{ role: "assistant", content: cleanedContent }],
        content_item_id: prefillIdea?.id || null,
      });
      if (data) {
        setCurrentScriptId(data.id);
        setChatHistory([{ role: "assistant", content: cleanedContent }]);
        onScriptCreated?.();
      }
    } catch (err) {
      setGeneratedText(`Error: ${err.message}`);
    }
    setLoading(false);
  };

  const sendChatMsg = async (text) => {
    const scriptId = isViewing ? selectedScript.id : currentScriptId;
    if (!scriptId) return;

    const prevHistory = isViewing ? [...displayChat] : [...chatHistory];
    const newHistory = [...prevHistory, { role: "user", content: text }];

    setChatHistory(newHistory);
    setLoading(true);
    setStreamingText("");

    try {
      const res = await fetch("/api/generate-script", {
        method: "POST",
        headers: await buildApiHeaders(),
        body: JSON.stringify({
          formatId: (isViewing ? selectedScript.format_id : formatId) || null,
          idea: displayTitle,
          chatHistory: newHistory,
        }),
      });

      if (!res.ok) {
        setLoading(false);
        return;
      }

      let assistantText = "";
      await parseSSE(res, (t) => {
        assistantText = t;
        setStreamingText(t);
        // Only update the main script display if it looks like a script response
        if (isScriptResponse(t)) {
          setGeneratedText(t);
        }
      });

      const finalHistory = [...newHistory, { role: "assistant", content: assistantText }];
      setChatHistory(finalHistory);
      setStreamingText("");

      // Only update generated_content if it's a script response
      const updatePayload = { chat_history: finalHistory };
      if (isScriptResponse(assistantText)) {
        updatePayload.generated_content = assistantText;
      }

      await updateScript(scriptId, updatePayload);
      onScriptUpdated?.();
    } catch {
      // silent
    }
    setLoading(false);
  };

  const setStatus = async (status) => {
    const scriptId = isViewing ? selectedScript.id : currentScriptId;
    if (!scriptId) return;
    await updateScript(scriptId, {
      status,
      final_content: displayContent,
    });

    // Voice Learning Loop — al aprobar comparamos AI draft vs final y
    // extraemos patrones (background, no bloquea). Team mode no tiene
    // companyId — el endpoint apunta a voice_profile (legacy team).
    if (status === "approved") {
      const aiDraft = isViewing ? selectedScript?.ai_draft_content : null;
      if (aiDraft && displayContent) {
        const formatName = formats.find((f) => f.id === (isViewing ? selectedScript?.format_id : formatId))?.name;
        buildApiHeaders().then((headers) => fetch("/api/extract-voice-patterns", {
          method: "POST",
          headers,
          body: JSON.stringify({
            companyId: null, // team mode
            aiDraft,
            userFinal: displayContent,
            scriptTitle: displayTitle,
            formatName: formatName || null,
          }),
        }).catch((err) => logger.warn("[voice-patterns] extraction failed:", err)));
      }
    }

    // If approving, try to find the linked content_idea and sync
    if (status === "approved") {
      let linkedIdeaId = null;

      // Priority 1: prefillIdea (coming from Ideas tab)
      if (prefillIdea?.id) linkedIdeaId = prefillIdea.id;

      // Priority 2: script has content_item_id FK
      if (!linkedIdeaId && isViewing && selectedScript?.content_item_id) {
        linkedIdeaId = selectedScript.content_item_id;
      }

      // Priority 3: match by title (for old scripts without FK)
      if (!linkedIdeaId && contentItems && displayTitle) {
        const match = contentItems.find((i) => i.title === displayTitle);
        if (match) {
          linkedIdeaId = match.id;
          // Also backfill the FK for future
          await updateScript(scriptId, { content_item_id: match.id });
        }
      }

      if (linkedIdeaId) {
        const fmtId = isViewing ? selectedScript.format_id : formatId;
        const selectedFormat = formats.find((f) => f.id === fmtId);
        const patch = {
          status: "scripting",
          body: ensureHtml(displayContent || ""),
        };
        if (selectedFormat) patch.formato = [selectedFormat.name];
        await updateContentItem(linkedIdeaId, patch);
      }
    }

    onScriptUpdated?.();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Input section — only show when not viewing an existing script */}
      {!isViewing && !readOnly && (
        <div style={darkCard}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: DS.textMuted,
              letterSpacing: "0.14em",
              marginBottom: 14,
            }}
          >
            NUEVO GUION
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder="Idea del contenido..."
              style={darkInput}
            />

            <FormatSelect
              formats={formats}
              value={formatId}
              onChange={setFormatId}
            />

            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const file = e.dataTransfer?.files?.[0];
                if (file && (file.type.startsWith("audio/") || file.type.startsWith("video/"))) {
                  setDroppedFile(file);
                }
              }}
            >
              <textarea
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder={dragging ? "Suelta el archivo aqui para transcribir..." : "Transcripcion del video referente (opcional). Puedes arrastrar un audio/video aqui."}
                rows={4}
                style={{
                  ...darkInput,
                  resize: "vertical",
                  lineHeight: 1.5,
                  border: dragging ? `2px dashed ${DS.blue}` : darkInput.border,
                  background: dragging ? "rgba(55,138,221,0.05)" : darkInput.background,
                }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <AudioUpload
                label="Transcribir referencia"
                droppedFile={droppedFile}
                onDropConsumed={() => setDroppedFile(null)}
                onTranscribed={(text) => setReference((prev) => prev ? prev + "\n" + text : text)}
              />
              <button
                onClick={() => {
                  const url = (reference.trim() || prefillIdea?.referencia_url || "").trim();
                  if (url) navigator.clipboard.writeText(url.split("\n")[0]);
                  window.open("https://cobalt.tools/", "_blank");
                }}
                style={{
                  ...darkBtnGhost,
                  padding: "6px 12px",
                  fontSize: 10,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
                title="Abre Cobalt Tools y copia el link de referencia"
              >
                📥 Descargar referencia
              </button>
            </div>

            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notas adicionales (opcional)..."
              rows={2}
              style={{ ...darkInput, resize: "vertical", lineHeight: 1.5 }}
            />

            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <button
                onClick={generate}
                disabled={!idea.trim() || loading}
                style={{
                  ...darkBtn,
                  opacity: !idea.trim() || loading ? 0.4 : 1,
                }}
              >
                {loading ? "Generando..." : "Guionizar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Output section */}
      {(displayContent || loading) && (
        <div style={darkCard}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 14,
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: DS.textMuted,
                letterSpacing: "0.14em",
              }}
            >
              {isViewing ? (
                <input
                  defaultValue={displayTitle}
                  readOnly={readOnly}
                  onBlur={readOnly ? undefined : async (e) => {
                    const val = e.target.value.trim();
                    if (val && val !== selectedScript.title) {
                      await updateScript(selectedScript.id, { title: val });
                      onScriptUpdated?.();
                    }
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                  style={{
                    background: "transparent", border: "none", outline: "none",
                    color: DS.textPrimary, fontSize: 16, fontWeight: 700, fontFamily: DS.font,
                    padding: 0, width: "100%",
                    cursor: readOnly ? "default" : "text",
                  }}
                  title={readOnly ? selectedScript.title : "Click para editar el nombre"}
                />
              ) : "GUION GENERADO"}
              <span style={{ marginLeft: 10, display: "inline-flex" }}>
                <ScriptDurationPill
                  content={displayContent}
                  onAdjustDensity={readOnly ? undefined : ({ instruction }) => {
                    setAdjustPrefill(instruction);
                    setShowAdjust(true);
                  }}
                />
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {!readOnly && (
                <>
                  <button
                    onClick={() => setShowAdjust(true)}
                    disabled={!displayContent}
                    style={{
                      ...darkBtn,
                      padding: "6px 14px",
                      fontSize: 11,
                      opacity: !displayContent ? 0.4 : 1,
                      background: `linear-gradient(135deg, ${DS.blue}, ${DS.purple})`,
                      color: "#fff",
                    }}
                  >
                    ✨ Ajustar con IA
                  </button>
                  <button
                    onClick={() => setStatus("approved")}
                    style={{
                      ...darkBtnGhost,
                      padding: "6px 14px",
                      fontSize: 11,
                      color: DS.green,
                      borderColor: "rgba(29,185,122,0.3)",
                    }}
                  >
                    Aprobar
                  </button>
                  <button
                    onClick={() => setStatus("rejected")}
                    style={{
                      ...darkBtnGhost,
                      padding: "6px 14px",
                      fontSize: 11,
                      color: DS.red,
                      borderColor: "rgba(226,75,74,0.3)",
                    }}
                  >
                    Rechazar
                  </button>
                </>
              )}
              <button
                onClick={() => {
                  // Strip HTML and copy as plain text
                  const plain = (displayContent || "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\n{3,}/g, "\n\n").trim();
                  navigator.clipboard.writeText(plain);
                }}
                style={{
                  ...darkBtnGhost,
                  padding: "6px 14px",
                  fontSize: 11,
                }}
              >
                Copiar
              </button>
            </div>
          </div>

          {loading && !displayContent ? (
            <div style={{
              padding: "40px 20px", textAlign: "center",
              color: DS.textMuted, fontSize: 13,
              border: DS.border, borderRadius: 10, background: DS.bgCard,
            }}>
              Generando guion...
            </div>
          ) : (
            <RichEditor
              content={ensureHtml(displayContent)}
              editable={!readOnly}
              onChange={readOnly ? undefined : (html) => {
                setGeneratedText(html);
                // Debounced auto-save
                if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
                saveTimerRef.current = setTimeout(async () => {
                  const scriptId = isViewing ? selectedScript?.id : currentScriptId;
                  if (!scriptId) return;
                  // Si el script ya tiene final_content (fue aprobado), hay
                  // que actualizar AMBOS campos — si no displayContent sigue
                  // mostrando el final_content viejo y los edits parecen
                  // "no guardarse". Bug reportado 2026-04-22.
                  const patch = { generated_content: html };
                  if (isViewing && selectedScript?.final_content) {
                    patch.final_content = html;
                  }
                  await updateScript(scriptId, patch);
                  setSavedFlash(true);
                  setTimeout(() => setSavedFlash(false), 1500);
                  onScriptUpdated?.();
                }, 800);
              }}
              placeholder="Genera un guion o escribe directamente aqui..."
            />
          )}

          {savedFlash && (
            <div style={{
              fontSize: 10, color: DS.green, marginTop: 6,
              display: "flex", alignItems: "center", gap: 4,
            }}>✓ Guardado</div>
          )}
        </div>
      )}

      {showAdjust && (
        <AIAdjustPopup
          currentContentHtml={displayContent}
          formatId={isViewing ? selectedScript?.format_id : formatId}
          idea={displayTitle}
          initialInstruction={adjustPrefill}
          onApply={async (newHtml, instruction) => {
            // Save to script
            setGeneratedText(newHtml);
            const scriptId = isViewing ? selectedScript?.id : currentScriptId;
            if (scriptId) {
              const newChatHistory = [
                ...(isViewing ? (selectedScript.chat_history || []) : chatHistory),
                { role: "user", content: instruction },
                { role: "assistant", content: newHtml },
              ];
              // Actualizar final_content también si estaba seteado (ver bug
              // del 2026-04-22 sobre final_content shadowing edits nuevos).
              const patch = {
                generated_content: newHtml,
                chat_history: newChatHistory,
              };
              if (isViewing && selectedScript?.final_content) {
                patch.final_content = newHtml;
              }
              await updateScript(scriptId, patch);
              setChatHistory(newChatHistory);
              onScriptUpdated?.();
            }
          }}
          onClose={() => { setShowAdjust(false); setAdjustPrefill(""); }}
        />
      )}
    </div>
  );
}
