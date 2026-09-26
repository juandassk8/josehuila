import { useState, useRef, useEffect } from "react";
import { DS, darkInput, darkBtn } from "../../lib/design.js";

export function ScriptChat({ chatHistory, onSend, loading, streamingText }) {
  const [msg, setMsg] = useState("");
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  const send = () => {
    const text = msg.trim();
    if (!text || loading) return;
    onSend(text);
    setMsg("");
  };

  if (!chatHistory?.length && !loading) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: DS.textMuted,
          letterSpacing: "0.14em",
          marginBottom: 10,
        }}
      >
        CHAT DE AJUSTE
      </div>

      <div
        style={{
          maxHeight: 320,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          marginBottom: 12,
        }}
      >
        {chatHistory.map((m, i) => (
          <div
            key={i}
            style={{
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "85%",
              padding: "10px 14px",
              borderRadius: 12,
              background:
                m.role === "user"
                  ? "rgba(55,138,221,0.15)"
                  : DS.bgCard,
              border:
                m.role === "user"
                  ? "1px solid rgba(55,138,221,0.25)"
                  : DS.border,
              color: DS.textPrimary,
              fontSize: 13,
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
            }}
          >
            {m.content}
          </div>
        ))}
        {loading && (
          <div
            style={{
              alignSelf: "flex-start",
              maxWidth: "85%",
              padding: "10px 14px",
              borderRadius: 12,
              background: DS.bgCard,
              border: DS.border,
              color: streamingText ? DS.textPrimary : DS.textMuted,
              fontSize: 13,
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
            }}
          >
            {streamingText || "Escribiendo..."}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
          placeholder="Ajustar guion... (ej: hazlo mas corto, cambia el hook)"
          style={{ ...darkInput, flex: 1 }}
          disabled={loading}
        />
        <button
          onClick={send}
          disabled={!msg.trim() || loading}
          style={{
            ...darkBtn,
            opacity: !msg.trim() || loading ? 0.4 : 1,
            padding: "10px 18px",
            flexShrink: 0,
          }}
        >
          Enviar
        </button>
      </div>
    </div>
  );
}
