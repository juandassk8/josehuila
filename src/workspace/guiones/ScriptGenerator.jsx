import { useState, useCallback, useRef, useEffect } from "react";
import { DS, darkInput, darkBtn, darkBtnGhost, darkCard } from "../../lib/design.js";
import { createScript, updateScript } from "./workspace_guiones_db.js";
import { useCompanyId, useCurrentMemberId } from "./context.js";
import { useCompanyProducts } from "./hooks/useCompanyProducts.js";
import { scriptMarkdownToHtml } from "../../lib/scriptToHtml.js";
import { extractTitleFromScript, stripTitleSection } from "../../lib/scriptParse.js";
import { ScriptDurationPill } from "../../lib/ScriptDurationPill.jsx";
import { AudioUpload } from "./AudioUpload.jsx";
import { FormatSelect } from "./FormatSelect.jsx";
import { AIAdjustPopup } from "./AIAdjustPopup.jsx";
import { RichEditor } from "./RichEditor.jsx";
import { StructurePickerCards } from "./StructurePickerCards.jsx";
import { TranscriptPickerCards } from "./TranscriptPickerCards.jsx";
import { ToneSelector } from "./ToneSelector.jsx";
import { useCompanyScriptStructures } from "./hooks/useCompanyScriptStructures.js";
import { addExampleToFormat, createFormat } from "./workspace_guiones_db.js";
import { updateSlot } from "../../despliegue/pipeline_db.js";
import { checkLimits, formatTokens, formatRelativeTime } from "../../lib/tokenLimits.js";
import { buildApiHeaders } from "../../lib/apiAuth.js";
import { logger } from "../../lib/logger.js";

// En workspace los "content items" son slots del despliegue (despliegue_slots).
// Mapeo: { status → status, body → script_body }. El campo `formato` no aplica
// a slots. El body del RichEditor viene en HTML; el slot tiene un textarea plano,
// así que convertimos HTML a texto manteniendo saltos de línea.
function htmlToPlainText(html) {
  if (!html) return "";
  // Reemplazos para preservar estructura visual:
  let txt = String(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
    .replace(/<\/h[1-6]>\s*/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<\/li>/gi, "\n");
  // Strip resto de tags vía DOMParser (decode entidades correctamente).
  try {
    const doc = new DOMParser().parseFromString(txt, "text/html");
    txt = doc.body.textContent || "";
  } catch {
    txt = txt.replace(/<[^>]+>/g, "");
  }
  return txt.replace(/\n{3,}/g, "\n\n").trim();
}

async function updateContentItem(slotId, patch) {
  if (!slotId) return { data: null, error: null };
  const slotPatch = {};
  if (patch?.status) slotPatch.status = patch.status;
  if (patch?.body !== undefined) slotPatch.script_body = htmlToPlainText(patch.body);
  if (patch?.review_status) slotPatch.review_status = patch.review_status;
  if (Object.keys(slotPatch).length === 0) return { data: null, error: null };
  try {
    const data = await updateSlot(slotId, slotPatch);
    return { data, error: null };
  } catch (error) {
    logger.error("[updateContentItem] failed:", error);
    return { data: null, error };
  }
}

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

export function ScriptGenerator({ formats, selectedScript, prefillIdea, contentItems, onScriptCreated, onScriptUpdated, readOnly = false, pipelineType = "ads" }) {
  const companyId = useCompanyId();
  const memberId = useCurrentMemberId();
  const { products } = useCompanyProducts(companyId);
  const [idea, setIdea] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [formatId, setFormatId] = useState("");
  // Producto seleccionado para este guion. Auto-set desde prefillIdea (slot)
  // o desde selectedScript. Si la empresa tiene 1 solo producto, lo usa por
  // default. Si tiene 0, queda null y el LLM recibe contexto vacío de producto.
  const [productId, setProductId] = useState("");
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
  const [adjustPrefill, setAdjustPrefill] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);
  const [truncatedWarning, setTruncatedWarning] = useState(false);
  // Estructura de guion (PAS, AIDA, etc.) — opcional. Se pasa a la AI.
  const { structures } = useCompanyScriptStructures(companyId);
  const [structureId, setStructureId] = useState(null);
  const activeStructure = structures.find((s) => s.id === structureId) || null;
  // Tono del guion: natural (Colombiano default) / neutral / professional.
  const [tone, setTone] = useState("natural");
  // Picker visual de transcripciones guardadas.
  const [transcriptPickerOpen, setTranscriptPickerOpen] = useState(false);
  // Estado de "guardar transcripción / formato" después de generar.
  const [savingExample, setSavingExample] = useState(false);
  const [savingScriptAsExample, setSavingScriptAsExample] = useState(false);
  const [savingFormat, setSavingFormat] = useState(false);
  const [saveAsFormatOpen, setSaveAsFormatOpen] = useState(false);
  // Rate limits — refresca al montar y después de cada generación.
  const [rateLimit, setRateLimit] = useState(null); // { blocked, warning, windows[], unlocksAt }
  const [showBlockModal, setShowBlockModal] = useState(false);
  const saveTimerRef = useRef(null);

  // Refresca los límites desde la DB.
  const refreshLimits = useCallback(async () => {
    if (!companyId) { setRateLimit(null); return; }
    try {
      const status = await checkLimits({ companyId });
      setRateLimit(status);
    } catch { /* fail-open */ }
  }, [companyId]);

  useEffect(() => { refreshLimits(); }, [refreshLimits]);

  // Prefill from content idea
  if (prefillIdea && prefillIdea.id !== prefilled) {
    setIdea(prefillIdea.title || "");
    setReference(prefillIdea.referencia_url || "");
    setNotes(prefillIdea.body || "");
    // Match format by name
    const ideaFormato = Array.isArray(prefillIdea.formato) ? prefillIdea.formato[0] : prefillIdea.formato;
    const matchedFormat = ideaFormato ? formats.find((f) => f.name === ideaFormato) : null;
    setFormatId(matchedFormat?.id || "");
    // Auto-marcar producto desde el slot (si fue seteado en SlotModal o
    // ContentModal). Si el slot no tiene producto, dejar el dropdown vacío.
    setProductId(prefillIdea._slot?.product_id || prefillIdea.product_id || "");
    setGeneratedText("");
    setChatHistory([]);
    setPrefilled(prefillIdea.id);
  }

  // Sync productId desde selectedScript cuando cambia (entrar a un script
  // existente) y default a único producto cuando solo hay uno.
  useEffect(() => {
    if (selectedScript?.product_id) {
      setProductId(selectedScript.product_id);
    } else if (!productId && products.length === 1) {
      setProductId(products[0].id);
    }
  }, [selectedScript?.id, products.length]); // eslint-disable-line react-hooks/exhaustive-deps


  // Load selected script into view
  const isViewing = !!selectedScript;
  const displayTitle = isViewing ? selectedScript.title : idea;
  // IMPORTANTE: prioridad `generated_content` primero. `final_content` es un
  // snapshot que se escribe al aprobar — si Nat edita post-aprobación, los
  // edits persisten en generated_content. Con la prioridad invertida antes
  // (final_content primero), los edits parecían "perdidos" porque el render
  // seguía mostrando la versión aprobada stale. Bug del 2026-04-22.
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
    // max_tokens NO es error — el guion se cortó pero hay contenido útil.
    // Lo guardamos y avisamos al user con un toast (no throw). El user puede
    // pedir continuación con el botón "Ajustar con IA" → "continuá donde
    // quedaste".
    if (stopReason === "max_tokens" && fullText.trim().length >= 50) {
      // Marker invisible que el caller puede detectar para mostrar toast.
      // No interrumpe el flow normal de save.
      onText(fullText, { truncated: true });
      return fullText;
    }
    if (stopReason && stopReason !== "end_turn" && stopReason !== "stop_sequence" && stopReason !== "max_tokens") {
      throw new Error(`Generación interrumpida (${stopReason}). ${fullText.length < 50 ? "Probable rate limit — espera 1 minuto y reintenta." : "Resultado parcial guardado."}`);
    }
    if (fullText.trim().length < 20) {
      throw new Error("Respuesta vacía del modelo. Probable rate limit — espera 1 minuto y reintenta.");
    }
    return fullText;
  }, []);

  const generate = async () => {
    // Permitimos generar con idea O con concepto seleccionado. Sin ninguno, nada.
    if (!idea.trim() && !formatId) return;
    // Pre-check de rate limit local (la DB es la fuente de verdad — el backend
    // re-chequea por las dudas — pero acá evitamos UI confusa).
    if (rateLimit?.blocked) { setShowBlockModal(true); return; }
    setLoading(true);
    setGeneratedText("");
    setChatHistory([]);
    setStreamingText("");
    setTruncatedWarning(false);

    const conceptName = formats.find((f) => f.id === formatId)?.name || "";
    const fallbackTitle = conceptName ? `Guion — ${conceptName}` : "Guion sin título";

    const abortController = new AbortController();
    try {
      const res = await fetch("/api/generate-script", {
        method: "POST",
        headers: await buildApiHeaders(),
        signal: abortController.signal,
        body: JSON.stringify({
          companyId,
          memberId,
          formatId: formatId || null,
          productId: productId || null,
          idea: idea.trim() || null,
          reference: reference.trim() || null,
          notes: notes.trim() || null,
          // Estructura de copy (PAS/AIDA/etc.) si el user eligió una.
          structure: activeStructure ? {
            name: activeStructure.name,
            template: activeStructure.template,
          } : null,
          tone: tone || "natural",
        }),
      });

      if (res.status === 429) {
        // Rate limit del backend — refresca status y abre modal.
        await refreshLimits();
        setShowBlockModal(true);
        setLoading(false);
        return;
      }
      if (!res.ok) {
        const err = await res.json();
        setGeneratedText(`Error: ${err.error?.message || err.error || "Unknown error"}`);
        setLoading(false);
        return;
      }

      // setGeneratedText recibe (text, opts?) — el opts.truncated llega cuando
      // el modelo se cortó por max_tokens (no por end_turn).
      const fullText = await parseSSE(res, (text, opts) => {
        setGeneratedText(text);
        if (opts?.truncated) setTruncatedWarning(true);
      }, abortController);

      // El LLM emite ## TÍTULO arriba del guion — lo extraemos como title
      // del script y guardamos generated_content sin esa sección.
      const aiTitle = extractTitleFromScript(fullText);
      const cleanedContent = stripTitleSection(fullText);
      if (aiTitle) setGeneratedText(cleanedContent);

      // Save to DB
      // ai_draft_content = snapshot inmutable del AI output. Nunca se sobrescribe
      // con edits del user — sirve para el voice learning loop al aprobar.
      const { data, error } = await createScript(companyId, {
        title: aiTitle || idea.trim() || fallbackTitle,
        format_id: formatId || null,
        product_id: productId || null,
        pipeline_type: pipelineType,
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
        // Si el guion está vinculado a un slot del despliegue (vino desde
        // "Guionizar esta idea") y el LLM emitió un título descriptivo,
        // propagamos ese título al slot. Así la pipeline del Despliegue
        // deja de mostrar "UGC #4" y muestra el título derivado del hook.
        if (aiTitle && data.content_item_id) {
          try { await updateSlot(data.content_item_id, { title: aiTitle }); }
          catch (e) { logger.error("[generate] propagate slot title failed:", e?.message || e); }
        }
        onScriptCreated?.();
      } else if (error) {
        const detail = error?.message || error?.hint || error?.details || String(error);
        logger.error("[generate] createScript failed:", error);
        setGeneratedText(`⚠️ El guion se generó pero NO se pudo guardar: ${detail}\n\n${fullText}`);
      }
      // Refresca usage para que el pill muestre los tokens nuevos. Pequeño
      // delay para que el log del backend ya esté commit en DB.
      setTimeout(refreshLimits, 1500);
    } catch (err) {
      setGeneratedText(`Error: ${err.message}`);
    }
    setLoading(false);
  };

  const sendChatMsg = async (text) => {
    const scriptId = isViewing ? selectedScript.id : currentScriptId;
    if (!scriptId) return;
    if (rateLimit?.blocked) { setShowBlockModal(true); return; }

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
          companyId,
          memberId,
          formatId: (isViewing ? selectedScript.format_id : formatId) || null,
          productId: (isViewing ? selectedScript.product_id : productId) || null,
          idea: displayTitle,
          chatHistory: newHistory,
        }),
      });

      if (res.status === 429) {
        await refreshLimits();
        setShowBlockModal(true);
        setLoading(false);
        return;
      }
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
      setTimeout(refreshLimits, 1500);
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

    // Voice Learning Loop — al aprobar, comparamos AI draft vs final y
    // extraemos patrones del usuario. Background, no bloquea la UI. Si los
    // edits son <20% de diferencia, el endpoint skip-ea (no gasta tokens).
    if (status === "approved") {
      const aiDraft = isViewing ? selectedScript?.ai_draft_content : null;
      if (aiDraft && displayContent) {
        const formatName = formats.find((f) => f.id === (isViewing ? selectedScript?.format_id : formatId))?.name;
        buildApiHeaders().then((headers) => fetch("/api/extract-voice-patterns", {
          method: "POST",
          headers,
          body: JSON.stringify({
            companyId,
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
          // Al aprobar en Guionista, el slot pide revisión automáticamente →
          // dispara creación de tarea para reviewers (updateSlot lo detecta).
          review_status: "requested",
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

            <div data-tour="concepto-script">
              <FormatSelect
                formats={formats}
                value={formatId}
                onChange={setFormatId}
              />
            </div>

            {/* Estructura de copy + tono — compactos, una sola fila */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {structures.length > 0 && (
                <StructurePickerCards
                  structures={structures}
                  value={structureId}
                  onChange={setStructureId}
                />
              )}
              <ToneSelector value={tone} onChange={setTone} />
            </div>

            {/* Selector de producto. Solo aparece si la empresa tiene 2+
                productos. La IA filtrará el contexto al producto elegido
                para no mezclar claims/ofertas entre productos distintos. */}
            {products.length >= 2 && (
              <div data-tour="selector-producto">
                <select
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  style={{ ...darkInput, cursor: "pointer" }}
                >
                  <option value="">📦 Selecciona producto…</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      📦 {p.name || "(sin nombre)"}
                    </option>
                  ))}
                </select>
                {!productId && (
                  <div style={{ fontSize: 10.5, color: DS.amber, marginTop: 4, lineHeight: 1.4 }}>
                    ⚠ Sin producto la IA va a mezclar info de los {products.length} productos. Recomendado elegir uno.
                  </div>
                )}
              </div>
            )}

            <div
              data-tour="referencia-propia-vs-tercero"
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
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                marginBottom: 6, flexWrap: "wrap",
              }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: DS.textSecondary, letterSpacing: "0.06em" }}>
                  TRANSCRIPCIÓN DEL REFERENTE <span style={{ color: DS.textHint, fontWeight: 500, letterSpacing: 0 }}>(opcional)</span>
                </span>
                <span style={{ flex: 1 }} />
                <button
                  type="button"
                  onClick={() => setTranscriptPickerOpen(true)}
                  style={{
                    ...darkBtnGhost, padding: "6px 12px", fontSize: 11,
                    display: "inline-flex", alignItems: "center", gap: 4,
                  }}
                >📚 Elegir guardada</button>
              </div>
              <textarea
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder={dragging ? "Suelta el archivo aqui para transcribir..." : "Pegá la transcripción acá, arrastrá un audio/video, o elegí una guardada con el botón."}
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
              data-tour="notas-guion"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notas adicionales (opcional)..."
              rows={2}
              style={{ ...darkInput, resize: "vertical", lineHeight: 1.5 }}
            />

            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <button
                onClick={generate}
                disabled={(!idea.trim() && !formatId) || loading || rateLimit?.blocked}
                style={{
                  ...darkBtn,
                  opacity: (!idea.trim() && !formatId) || loading || rateLimit?.blocked ? 0.4 : 1,
                  cursor: rateLimit?.blocked ? "not-allowed" : "pointer",
                }}
                title={
                  rateLimit?.blocked
                    ? "Límite de tokens alcanzado — esperá al reset"
                    : !idea.trim() && !formatId
                      ? "Escribí una idea o seleccioná un concepto"
                      : !idea.trim()
                        ? "Sin idea — voy a usar el concepto + info del producto"
                        : ""
                }
              >
                {loading ? "Generando..." : "Guionizar"}
              </button>

              {/* Pill de uso de tokens — solo workspace cliente. Click abre detalle.
                  Si el user es team Inforce con bypass activo, el pill no aparece
                  (no hay límite que mostrar). */}
              {rateLimit && !rateLimit.bypass && rateLimit.windows.length > 0 && (
                <span data-tour="tokens">
                  <RateLimitPill
                    status={rateLimit}
                    onClick={() => setShowBlockModal(true)}
                  />
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de bloqueo / detalle de uso — no aplica si hay bypass de team. */}
      {showBlockModal && rateLimit && !rateLimit.bypass && (
        <RateLimitModal
          status={rateLimit}
          onClose={() => setShowBlockModal(false)}
        />
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
                  {/* Save REFERENCIA externa pegada como ejemplo del formato */}
                  {formatId && reference.trim() && (
                    <button
                      onClick={async () => {
                        if (savingExample) return;
                        const title = window.prompt("Título corto para esta referencia:", idea?.trim() || "Referencia");
                        if (!title) return;
                        const isOwn = window.confirm("¿Es transcripción de un anuncio TUYO? (OK = sí · Cancelar = referencia externa)");
                        setSavingExample(true);
                        try {
                          await addExampleToFormat(formatId, {
                            title: title.trim(),
                            transcript: reference.trim(),
                            is_own: isOwn,
                          });
                          setSavedFlash(true);
                          setTimeout(() => setSavedFlash(false), 1800);
                        } finally {
                          setSavingExample(false);
                        }
                      }}
                      style={{ ...darkBtnGhost, padding: "6px 14px", fontSize: 11 }}
                      title="Guardar la URL / texto de referencia como ejemplo del formato"
                    >
                      {savingExample ? "Guardando…" : "💾 Guardar referencia"}
                    </button>
                  )}
                  {/* Save GUION FINAL generado como transcripción del formato.
                      Disponible siempre que haya formato seleccionado y guion
                      generado — independiente de que haya referencia pegada o no.
                      Es lo que el usuario pidió: convertir un guion exitoso en
                      ejemplo permanente del formato para futuras generaciones. */}
                  {formatId && displayContent && (
                    <button
                      onClick={async () => {
                        if (savingScriptAsExample) return;
                        const defaultTitle = (idea?.trim()) || (isViewing && selectedScript?.title) || "Guion ejemplo";
                        const title = window.prompt("Título corto para esta transcripción:", defaultTitle);
                        if (!title) return;
                        setSavingScriptAsExample(true);
                        try {
                          const cleanText = htmlToPlainText(displayContent);
                          await addExampleToFormat(formatId, {
                            title: title.trim(),
                            transcript: cleanText,
                            is_own: true,
                          });
                          setSavedFlash(true);
                          setTimeout(() => setSavedFlash(false), 1800);
                        } finally {
                          setSavingScriptAsExample(false);
                        }
                      }}
                      disabled={!displayContent}
                      style={{
                        ...darkBtnGhost, padding: "6px 14px", fontSize: 11,
                        opacity: !displayContent ? 0.4 : 1,
                      }}
                      title="Guardar el guion final como transcripción ejemplo del formato"
                    >
                      {savingScriptAsExample ? "Guardando…" : "📝 Guardar guion como transcripción"}
                    </button>
                  )}
                  {/* Save como formato nuevo */}
                  <button
                    onClick={() => setSaveAsFormatOpen(true)}
                    disabled={!displayContent}
                    style={{
                      ...darkBtnGhost, padding: "6px 14px", fontSize: 11,
                      opacity: !displayContent ? 0.4 : 1,
                    }}
                    title="Crear un formato nuevo a partir de este guion"
                  >🧱 Guardar como formato</button>
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
                  // Si el script ya tiene final_content (fue aprobado o ya
                  // editado post-aprobación), debemos actualizar AMBOS campos
                  // sino displayContent sigue mostrando final_content viejo
                  // y los edits parecen "no guardarse". Bug reportado 2026-04-22.
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

          {truncatedWarning && (
            <div style={{
              marginTop: 10, padding: "10px 14px", borderRadius: 8,
              background: "rgba(245,166,35,0.12)",
              border: "1px solid rgba(245,166,35,0.35)",
              color: DS.amber, fontSize: 12, lineHeight: 1.5,
              display: "flex", alignItems: "flex-start", gap: 8,
            }}>
              <span style={{ fontSize: 14, flexShrink: 0 }}>⚠</span>
              <div style={{ flex: 1 }}>
                <strong>El guion se cortó por longitud</strong> — el modelo llegó al máximo de tokens permitido.
                {" "}Usá <strong>"Ajustar con IA"</strong> y pedile "continuá donde quedaste" para completar la parte que falta.
                <button
                  onClick={() => setTruncatedWarning(false)}
                  style={{
                    background: "transparent", border: "none",
                    color: DS.amber, cursor: "pointer",
                    fontSize: 11, fontWeight: 700, marginLeft: 6,
                    padding: 0, textDecoration: "underline",
                  }}
                >Cerrar</button>
              </div>
            </div>
          )}
        </div>
      )}

      {showAdjust && (
        <AIAdjustPopup
          currentContentHtml={displayContent}
          formatId={isViewing ? selectedScript?.format_id : formatId}
          productId={isViewing ? selectedScript?.product_id : productId}
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
              // Si hay final_content previamente seteado, actualizamos ambos
              // para que el editor muestre el nuevo guión ajustado (ver bug
              // de 2026-04-22 sobre final_content shadowing).
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

      {/* Picker de transcripciones guardadas — cards visuales */}
      {transcriptPickerOpen && (
        <TranscriptPickerCards
          formats={formats}
          currentFormatId={formatId}
          onPick={(text) => {
            setReference(text);
            setTranscriptPickerOpen(false);
          }}
          onClose={() => setTranscriptPickerOpen(false)}
        />
      )}

      {/* Modal: guardar como nuevo formato */}
      {saveAsFormatOpen && (
        <SaveAsFormatModal
          companyId={companyId}
          defaultName={idea?.trim() ? `${idea.trim().slice(0, 40)} — formato` : ""}
          referenceTranscript={reference.trim() || ""}
          structure={activeStructure}
          generatedHtml={generatedText}
          onClose={() => setSaveAsFormatOpen(false)}
          onSaved={() => {
            setSaveAsFormatOpen(false);
            setSavedFlash(true);
            setTimeout(() => setSavedFlash(false), 1800);
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// SaveAsFormatModal: crea un formato nuevo seedeado con la transcripción
// del referente actual + el guion generado como ejemplo. La estructura
// activa se copia al campo `structure` del formato para que las próximas
// generaciones partan de ese framework.
// ─────────────────────────────────────────────────────────────────────
function SaveAsFormatModal({ companyId, defaultName, referenceTranscript, structure, generatedHtml, onClose, onSaved }) {
  const [name, setName] = useState(defaultName || "");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const h = (e) => { if (e.key === "Escape" && !busy) onClose?.(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, busy]);

  const submit = async () => {
    setError("");
    if (!name.trim()) { setError("Pon un nombre para el formato."); return; }
    setBusy(true);
    try {
      const examples = [];
      if (referenceTranscript) {
        examples.push({ title: "Transcripción referente", transcript: referenceTranscript, is_own: false });
      }
      const { error: err } = await createFormat(companyId, {
        name: name.trim(),
        description: description.trim() || null,
        structure: structure?.template || null,
        examples,
      });
      if (err) { setError(err.message || "No se pudo crear el formato."); setBusy(false); return; }
      onSaved?.();
    } catch (e) {
      setError(e?.message || String(e));
      setBusy(false);
    }
  };

  return (
    <div onClick={() => !busy && onClose?.()} style={{
      position: "fixed", inset: 0, zIndex: 10000,
      background: "rgba(0,0,0,0.65)", backdropFilter: "blur(3px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20, fontFamily: DS.font,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: "min(540px, 100%)",
        background: DS.bgSide, border: `1px solid ${DS.textHint}`,
        borderRadius: 14, padding: "22px 26px",
        color: DS.textPrimary,
      }}>
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: DS.textMuted, marginBottom: 6 }}>
            Guardar como formato nuevo
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: "-0.01em" }}>
            Nuevo formato a partir de este guion
          </h2>
          <p style={{ fontSize: 12, color: DS.textSecondary, margin: "6px 0 0", lineHeight: 1.5 }}>
            Se va a guardar como formato disponible para todos los próximos guiones.
            Incluye la transcripción del referente como primer ejemplo
            {structure ? ` y la estructura "${structure.name}" como framework por default` : ""}.
          </p>
        </div>

        {error && (
          <div style={{
            padding: "10px 12px", marginBottom: 14, borderRadius: 8,
            background: `${DS.red}18`, border: `1px solid ${DS.red}55`,
            color: DS.red, fontSize: 12,
          }}>{error}</div>
        )}

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: DS.textMuted, marginBottom: 6, display: "block" }}>
            Nombre del formato
          </label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Comparativo · Antes vs Después"
            style={darkInput}
          />
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: DS.textMuted, marginBottom: 6, display: "block" }}>
            Descripción (opcional)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Breve descripción del formato y cuándo usarlo"
            rows={3}
            style={{ ...darkInput, resize: "vertical", lineHeight: 1.5 }}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} disabled={busy} style={{ ...darkBtnGhost, padding: "9px 18px", fontSize: 12 }}>Cancelar</button>
          <button onClick={submit} disabled={busy || !name.trim()} style={{
            ...darkBtn, padding: "9px 22px", fontSize: 12,
            opacity: busy || !name.trim() ? 0.5 : 1,
            cursor: busy || !name.trim() ? "not-allowed" : "pointer",
          }}>{busy ? "Creando…" : "Crear formato"}</button>
        </div>
      </div>
    </div>
  );
}

// Pill compacto que muestra estado del rate limit. Color verde si todo bien,
// amarillo si alguna ventana pasó el warn, rojo si está bloqueado. Click abre
// el modal con el detalle por ventana.
function RateLimitPill({ status, onClick }) {
  // Mostramos la ventana "más apretada" (mayor % usado) — es la que más le
  // importa al usuario en este momento.
  const tightest = [...status.windows].sort((a, b) => b.percent - a.percent)[0];
  if (!tightest) return null;

  let bg, color, border, label;
  if (status.blocked) {
    bg = "rgba(226,75,74,0.12)";
    color = "#E24B4A";
    border = "1px solid rgba(226,75,74,0.4)";
    label = `🚫 Sin tokens · vuelve ${formatRelativeTime(status.unlocksAt)}`;
  } else if (status.warning) {
    bg = "rgba(245,166,35,0.12)";
    color = "#F5A623";
    border = "1px solid rgba(245,166,35,0.4)";
    label = `⚠️ ${formatTokens(tightest.used)} / ${formatTokens(tightest.cap)} en la ${tightest.label}`;
  } else {
    bg = "rgba(29,158,117,0.10)";
    color = "#1D9E75";
    border = "1px solid rgba(29,158,117,0.30)";
    label = `${formatTokens(tightest.used)} / ${formatTokens(tightest.cap)} esta ${tightest.label.replace("últimas ", "").replace("última ", "")}`;
  }

  return (
    <button
      onClick={onClick}
      title="Click para ver detalle"
      style={{
        padding: "5px 12px", borderRadius: 50, border,
        background: bg, color,
        fontSize: 11, fontWeight: 700, cursor: "pointer",
        fontFamily: DS.font, letterSpacing: "0.01em",
      }}
    >
      {label}
    </button>
  );
}

// Modal con detalle de las 3 ventanas. Se abre cuando el usuario hace click
// en el pill, o cuando el sistema bloquea una generación.
function RateLimitModal({ status, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 480,
          // bgSide es sólido (#0A0A10 dark, #FBFBFA light). Antes usaba bgCard
          // que es rgba 3% — quedaba transparente sobre el backdrop oscuro.
          background: DS.bgSide, borderRadius: 16,
          border: DS.border, padding: "24px 26px",
          fontFamily: DS.font, color: DS.textPrimary,
          boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
        }}
      >
        <div style={{
          fontSize: 13, fontWeight: 800, letterSpacing: "0.16em",
          color: status.blocked ? "#E24B4A" : DS.textMuted, textTransform: "uppercase",
          marginBottom: 6,
        }}>
          {status.blocked ? "🚫 LÍMITE ALCANZADO" : "📊 USO DEL GUIONISTA"}
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.01em", marginBottom: 4 }}>
          {status.blocked
            ? `Volvés a generar ${formatRelativeTime(status.unlocksAt)}`
            : "Estás dentro del límite"}
        </div>
        <div style={{ fontSize: 12.5, color: DS.textMuted, lineHeight: 1.5, marginBottom: 18 }}>
          {status.blocked
            ? "Para evitar costos descontrolados, el Guionista tiene 3 límites rolling por empresa. Cuando uno se llena, esperás a que tokens viejos salgan de su ventana."
            : "Tu equipo comparte un pool de tokens por empresa. Distribuído en 3 ventanas para que nadie queme todo de una."}
        </div>

        {status.windows.map((w) => {
          const barColor = w.isBlocking ? "#E24B4A" : w.isWarning ? "#F5A623" : "#1D9E75";
          return (
            <div key={w.key} style={{ marginBottom: 14 }}>
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "baseline",
                fontSize: 11.5, marginBottom: 4,
              }}>
                <span style={{ color: DS.textMuted, fontWeight: 600, textTransform: "capitalize" }}>
                  {w.label}
                </span>
                <span style={{ color: DS.textPrimary, fontWeight: 700 }}>
                  {formatTokens(w.used)} / {formatTokens(w.cap)}
                </span>
              </div>
              <div style={{
                height: 6, background: "rgba(127,127,127,0.15)",
                borderRadius: 50, overflow: "hidden",
              }}>
                <div style={{
                  width: `${Math.min(100, w.percent)}%`,
                  height: "100%", background: barColor,
                  transition: "width 250ms ease",
                }} />
              </div>
              {w.isBlocking && (
                <div style={{ fontSize: 10.5, color: "#E24B4A", marginTop: 4, fontWeight: 600 }}>
                  Bloqueado · libera {formatRelativeTime(w.unlocksAt)}
                </div>
              )}
            </div>
          );
        })}

        <button
          onClick={onClose}
          style={{
            ...darkBtn, marginTop: 8, width: "100%",
            padding: "10px 0", fontSize: 12.5,
          }}
        >
          Entendido
        </button>
      </div>
    </div>
  );
}
