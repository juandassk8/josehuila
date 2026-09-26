// AI Strategic Advisor — chat con Claude Opus 4.7 con context snapshot
// inyectado automáticamente. Soporta múltiples conversaciones, streaming,
// extracción de [ACTION] tags para Action Engine.

import { useEffect, useRef, useState } from "react";
import { DS, darkInput, darkBtn, darkBtnGhost, withAlpha } from "../../../lib/design.js";
import { listMessages } from "../data/financeDb.js";
import { useVoiceRecorder } from "../hooks/useVoiceRecorder.js";
import { buildApiHeaders } from "../../../lib/apiAuth.js";

const SUGGESTED_PROMPTS = [
  "¿Cuál es la salud actual de mi negocio?",
  "¿Puedo gastar 2 millones en una cámara nueva?",
  "¿Qué debo hacer esta semana para llegar a mi meta de MRR?",
  "¿Dónde estoy sangrando dinero?",
  "Dame un plan de 72 horas para generar 5 millones",
  "Si Wake Up no paga, ¿qué hago?",
];

// Parser de [ACTION] tags en el texto.
function extractActions(text) {
  if (!text) return [];
  const lines = text.split("\n");
  const actions = [];
  for (const line of lines) {
    const m = line.match(/^\s*\[ACTION\]\s+(.+?)\s*$/i);
    if (m && m[1]) actions.push(m[1].trim());
  }
  return actions;
}

// Quita las líneas [ACTION] del cuerpo del mensaje cuando se renderiza
// la pretty version (las mostramos como chips abajo).
function stripActionTags(text) {
  return text
    .split("\n")
    .filter((line) => !/^\s*\[ACTION\]/i.test(line))
    .join("\n")
    .trim();
}

export function AIAdvisorChat({ finance }) {
  const { conversations, createConversation, createAction } = finance;
  const [activeConvId, setActiveConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [autoSendVoice, setAutoSendVoice] = useState(true); // si true, al transcribir manda directo
  const scrollRef = useRef(null);
  const textareaRef = useRef(null);

  // Grabación por voz: al transcribir, agrega al draft (o manda directo si auto-send está on).
  const voice = useVoiceRecorder({
    onTranscribed: (text) => {
      const cleaned = text.trim();
      if (!cleaned) return;
      if (autoSendVoice) {
        sendMessage(cleaned);
      } else {
        setDraft((prev) => (prev ? `${prev} ${cleaned}` : cleaned));
        textareaRef.current?.focus();
      }
    },
  });

  // Cargar mensajes cuando cambia la conversación activa
  useEffect(() => {
    if (!activeConvId) {
      setMessages([]);
      return;
    }
    listMessages(activeConvId).then(({ data }) => {
      setMessages(data || []);
    });
  }, [activeConvId]);

  // Auto-scroll al final
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streaming]);

  const startConversation = async () => {
    const conv = await createConversation({
      title: `Chat ${new Date().toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`,
    });
    setActiveConvId(conv.id);
    setMessages([]);
    return conv.id;
  };

  const sendMessage = async (textOverride) => {
    const text = (textOverride ?? draft).trim();
    if (!text || busy) return;

    let convId = activeConvId;
    if (!convId) {
      const newConv = await startConversation();
      convId = newConv;
    }

    setDraft("");
    setError("");
    setBusy(true);
    setStreaming("");

    // Optimistic: agregar user message al state local
    const userMsg = { role: "user", content: text, id: `temp-user-${Date.now()}` };
    setMessages((prev) => [...prev, userMsg]);

    // Armar historial para el API (excluyendo el current draft que ya está en userMsg)
    const apiMessages = [...messages, userMsg].map((m) => ({
      role: m.role, content: m.content,
    }));

    try {
      const res = await fetch("/api/finance-ai?action=chat", {
        method: "POST",
        headers: await buildApiHeaders(),
        body: JSON.stringify({
          messages: apiMessages,
          conversationId: convId,
        }),
      });

      if (!res.ok || !res.body) {
        const errBody = await res.text();
        throw new Error("Chat falló: " + errBody);
      }

      const reader = res.body.getReader();
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
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.type === "delta" && parsed.text) {
              fullText += parsed.text;
              setStreaming(fullText);
            } else if (parsed.type === "done") {
              fullText = parsed.fullText || fullText;
            } else if (parsed.type === "error") {
              throw new Error(parsed.error);
            }
          } catch (e) {
            // ignorar parse errors de líneas incompletas
          }
        }
      }

      // Persistir local + clear streaming
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: fullText, id: `temp-assistant-${Date.now()}` },
      ]);
      setStreaming("");
    } catch (e) {
      setError(e?.message || String(e));
      setStreaming("");
    } finally {
      setBusy(false);
    }
  };

  const handleAddAction = async (actionText) => {
    try {
      await createAction({
        title: actionText,
        priority: "medium",
        generated_by: "ai",
        related_conversation_id: activeConvId,
      });
      // Flash visual: mostrar feedback rápido
    } catch (e) {
      setError("No se pudo agregar al Action Engine: " + e.message);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "240px 1fr",
      gap: 12,
      height: "calc(100vh - 220px)",
      minHeight: 500,
    }}>
      {/* Sidebar de conversaciones */}
      <div style={{
        background: DS.bgCard, border: DS.border, borderRadius: 14,
        padding: 12, display: "flex", flexDirection: "column", gap: 8, overflow: "hidden",
      }}>
        <button onClick={() => { setActiveConvId(null); setMessages([]); }} style={{
          padding: "9px 14px", borderRadius: 10, border: "none",
          background: DS.green, color: "#fff",
          fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: DS.font,
        }}>+ Nueva conversación</button>
        <div style={{
          fontSize: 9, fontWeight: 700, color: DS.textMuted,
          letterSpacing: "0.12em", textTransform: "uppercase", marginTop: 4,
        }}>HISTORIAL</div>
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
          {conversations.length === 0 ? (
            <div style={{ fontSize: 11, color: DS.textMuted, padding: "8px 4px", fontStyle: "italic" }}>
              Sin conversaciones previas.
            </div>
          ) : (
            conversations.map((c) => {
              const active = c.id === activeConvId;
              return (
                <button key={c.id} onClick={() => setActiveConvId(c.id)} style={{
                  padding: "8px 10px", borderRadius: 8, border: "none",
                  background: active ? withAlpha(DS.green, "22") : "transparent",
                  color: active ? DS.textPrimary : DS.textSecondary,
                  fontSize: 11, textAlign: "left", cursor: "pointer",
                  fontFamily: DS.font, fontWeight: active ? 600 : 500,
                }}>
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.title || "Sin título"}
                  </div>
                  <div style={{ fontSize: 9, color: DS.textMuted, marginTop: 2 }}>
                    {new Date(c.updated_at).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Chat principal */}
      <div style={{
        background: DS.bgCard, border: DS.border, borderRadius: 14,
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "14px 18px",
          borderBottom: `1px solid ${withAlpha(DS.textHint, "33")}`,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ fontSize: 18 }}>🤖</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>AI Strategic Advisor</div>
            <div style={{ fontSize: 10, color: DS.textMuted }}>
              Tu asesor financiero con contexto completo · Claude Opus 4.7
            </div>
          </div>
        </div>

        {/* Mensajes */}
        <div ref={scrollRef} style={{
          flex: 1, padding: 18, overflowY: "auto",
          display: "flex", flexDirection: "column", gap: 14,
        }}>
          {messages.length === 0 && !streaming && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center", padding: "40px 20px" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🤖</div>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>¿En qué te ayudo hoy?</div>
              <div style={{ fontSize: 12, color: DS.textMuted, marginBottom: 20, maxWidth: 420, lineHeight: 1.5 }}>
                Tengo acceso a tu saldo, runway, clientes, equipo, suscripciones, y todas las transacciones. Te respondo con data real, no genérico.
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", maxWidth: 600 }}>
                {SUGGESTED_PROMPTS.map((p) => (
                  <button key={p} onClick={() => sendMessage(p)} disabled={busy} style={{
                    padding: "8px 14px", borderRadius: 50,
                    border: `1px solid ${withAlpha(DS.textHint, "55")}`,
                    background: "transparent",
                    color: DS.textSecondary,
                    fontSize: 11, cursor: "pointer", fontFamily: DS.font,
                  }}>{p}</button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <Message key={m.id || i} message={m} onAddAction={handleAddAction} />
          ))}

          {streaming && (
            <Message message={{ role: "assistant", content: streaming }} streaming onAddAction={handleAddAction} />
          )}

          {error && (
            <div style={{
              padding: 12, borderRadius: 10,
              background: "rgba(226,75,74,0.12)", border: "1px solid rgba(226,75,74,0.4)",
              color: DS.red, fontSize: 12,
            }}>{error}</div>
          )}
        </div>

        {/* Input + botón mic */}
        <div style={{
          padding: 14, borderTop: `1px solid ${withAlpha(DS.textHint, "33")}`,
          display: "flex", flexDirection: "column", gap: 8,
        }}>
          {/* Indicador de grabación / transcripción */}
          {voice.state === "recording" && (
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "8px 12px", borderRadius: 50,
              background: withAlpha(DS.red, "12"),
              border: `1px solid ${withAlpha(DS.red, "55")}`,
              color: DS.textPrimary, fontSize: 12,
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: "50%", background: DS.red,
                animation: "ai-rec-blink 1s ease-in-out infinite",
              }} />
              <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                Grabando {Math.floor(voice.elapsed / 60)}:{String(voice.elapsed % 60).padStart(2, "0")}
              </span>
              <span style={{ flex: 1, color: DS.textMuted, fontSize: 11 }}>
                Click en mic otra vez para enviar · ✕ para cancelar
              </span>
              <button
                onClick={voice.cancel}
                style={{
                  padding: "4px 10px", borderRadius: 50, border: "none",
                  background: "transparent", color: DS.textMuted,
                  fontSize: 12, cursor: "pointer", fontFamily: DS.font,
                }}
                title="Cancelar grabación"
              >✕</button>
            </div>
          )}
          {voice.state === "transcribing" && (
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "8px 12px", borderRadius: 50,
              background: withAlpha(DS.amber, "12"),
              border: `1px solid ${withAlpha(DS.amber, "55")}`,
              color: DS.textPrimary, fontSize: 12,
            }}>
              <span style={{ fontSize: 14 }}>⋯</span>
              <span style={{ fontWeight: 600 }}>Transcribiendo audio…</span>
            </div>
          )}
          {voice.state === "error" && voice.error && (
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "8px 12px", borderRadius: 8,
              background: withAlpha(DS.red, "12"),
              border: `1px solid ${withAlpha(DS.red, "55")}`,
              color: DS.red, fontSize: 11,
            }}>
              <span>⚠️ {voice.error}</span>
              <span style={{ flex: 1 }} />
              <button
                onClick={voice.reset}
                style={{
                  padding: "3px 10px", borderRadius: 50, border: `1px solid ${DS.red}`,
                  background: "transparent", color: DS.red,
                  fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: DS.font,
                }}
              >Cerrar</button>
            </div>
          )}

          {/* Toggle "enviar al transcribir" */}
          <label style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            fontSize: 10, color: DS.textMuted, cursor: "pointer", userSelect: "none",
          }}>
            <input
              type="checkbox"
              checked={autoSendVoice}
              onChange={(e) => setAutoSendVoice(e.target.checked)}
              style={{ width: 12, height: 12, cursor: "pointer" }}
            />
            <span>Enviar automáticamente cuando termine de transcribir</span>
          </label>

          {/* Input row */}
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={voice.state === "recording"
                ? "Hablando… click mic para terminar"
                : 'Pregúntale algo o grabá un audio… (ej. "¿Puedo gastar X en Y?")'
              }
              disabled={busy || voice.state === "recording" || voice.state === "transcribing"}
              rows={2}
              style={{
                ...darkInput, flex: 1, resize: "none", fontFamily: DS.font, lineHeight: 1.5,
              }}
            />
            <button
              onClick={voice.toggle}
              disabled={busy || voice.state === "transcribing" || !voice.supported}
              title={voice.state === "recording" ? "Parar grabación" : "Grabar audio (Whisper)"}
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                border: `1px solid ${voice.state === "recording" ? DS.red : DS.textHint}`,
                background: voice.state === "recording"
                  ? withAlpha(DS.red, "22")
                  : "rgba(255,255,255,0.04)",
                color: voice.state === "recording" ? DS.red : DS.textPrimary,
                fontSize: 18,
                cursor: "pointer",
                fontFamily: DS.font,
                opacity: (busy || !voice.supported) ? 0.5 : 1,
                transition: "all 0.2s",
                boxShadow: voice.state === "recording" ? `0 0 0 4px ${withAlpha(DS.red, "18")}` : "none",
                animation: voice.state === "recording" ? "ai-rec-pulse 1.4s ease-in-out infinite" : "none",
              }}
            >
              {voice.state === "recording" ? "■" : voice.state === "transcribing" ? "⋯" : "🎤"}
            </button>
            <button
              onClick={() => sendMessage()}
              disabled={busy || !draft.trim() || voice.state === "recording"}
              style={{
                ...darkBtn,
                padding: "10px 18px",
                opacity: (busy || !draft.trim() || voice.state === "recording") ? 0.5 : 1,
              }}
            >
              {busy ? "..." : "Enviar"}
            </button>
          </div>

          <style>{`
            @keyframes ai-rec-blink {
              0%, 100% { opacity: 1; }
              50%      { opacity: 0.3; }
            }
            @keyframes ai-rec-pulse {
              0%, 100% { box-shadow: 0 0 0 4px ${withAlpha(DS.red, "18")}; }
              50%      { box-shadow: 0 0 0 8px ${withAlpha(DS.red, "06")}; }
            }
          `}</style>
        </div>
      </div>
    </div>
  );
}

function Message({ message, streaming, onAddAction }) {
  const isUser = message.role === "user";
  const actions = !isUser ? extractActions(message.content) : [];
  const body = !isUser ? stripActionTags(message.content) : message.content;

  return (
    <div style={{
      display: "flex",
      flexDirection: isUser ? "row-reverse" : "row",
      gap: 10,
      alignItems: "flex-start",
    }}>
      <div style={{
        width: 30, height: 30, borderRadius: "50%",
        background: isUser ? DS.blue : DS.green,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 14, flexShrink: 0,
      }}>
        {isUser ? "👤" : "🤖"}
      </div>
      <div style={{
        background: isUser ? withAlpha(DS.blue, "12") : "rgba(0,0,0,0.2)",
        border: `1px solid ${isUser ? withAlpha(DS.blue, "44") : withAlpha(DS.textHint, "33")}`,
        borderRadius: 12,
        padding: "10px 14px",
        maxWidth: "78%",
        fontSize: 13,
        lineHeight: 1.6,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}>
        {body}
        {streaming && <span style={{ display: "inline-block", width: 6, height: 12, background: DS.green, marginLeft: 4, animation: "ai-cursor 0.8s ease-in-out infinite" }} />}

        {actions.length > 0 && !streaming && (
          <div style={{
            marginTop: 12, paddingTop: 10,
            borderTop: `1px solid ${withAlpha(DS.green, "44")}`,
            display: "flex", flexDirection: "column", gap: 6,
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: DS.green, letterSpacing: "0.12em" }}>
              ACCIONES SUGERIDAS
            </div>
            {actions.map((a, i) => (
              <button key={i} onClick={() => onAddAction(a)} style={{
                padding: "6px 12px", borderRadius: 8,
                border: `1px solid ${withAlpha(DS.green, "55")}`,
                background: withAlpha(DS.green, "12"),
                color: DS.textPrimary,
                fontSize: 12, fontWeight: 500, textAlign: "left",
                cursor: "pointer", fontFamily: DS.font,
                display: "flex", alignItems: "center", gap: 8,
              }}>
                <span style={{ fontSize: 14 }}>+</span>
                <span style={{ flex: 1 }}>{a}</span>
                <span style={{ fontSize: 10, color: DS.green, fontWeight: 700 }}>→ ACCIONES</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes ai-cursor {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
