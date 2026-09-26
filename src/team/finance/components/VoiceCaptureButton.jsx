// FAB de captura por voz. Click → graba audio → suelta → transcribe (Whisper)
// → parsea (Claude) → muestra modal de confirmación → user guarda transacción.
//
// Usa el hook `useVoiceRecorder` compartido con AIAdvisorChat para la
// grabación + transcripción. El parsing es específico de transactions.

import { useState } from "react";
import { DS, withAlpha } from "../../../lib/design.js";
import { useVoiceRecorder } from "../hooks/useVoiceRecorder.js";
import { VoiceConfirmModal } from "../modals/VoiceConfirmModal.jsx";
import { buildApiHeaders } from "../../../lib/apiAuth.js";

export function VoiceCaptureButton({ finance }) {
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState("");
  const [parsed, setParsed] = useState(null);
  const [transcription, setTranscription] = useState("");

  const voice = useVoiceRecorder({
    onTranscribed: async (text) => {
      setTranscription(text);
      setParsing(true);
      setParseError("");
      try {
        const res = await fetch("/api/finance-ai?action=parse", {
          method: "POST",
          headers: await buildApiHeaders(),
          body: JSON.stringify({ transcription: text }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error("Parsing falló: " + (err.error || res.status));
        }
        const { parsed: parsedData } = await res.json();
        setParsed(parsedData);
      } catch (e) {
        setParseError(e?.message || String(e));
      } finally {
        setParsing(false);
      }
    },
  });

  const handleConfirm = async (payload) => {
    try {
      await finance.createTransaction(payload);
      setParsed(null);
      setTranscription("");
      voice.reset();
    } catch (e) {
      setParseError("No se pudo guardar: " + (e?.message || e));
    }
  };

  const handleDiscard = () => {
    setParsed(null);
    setTranscription("");
    setParseError("");
    voice.reset();
  };

  const handleRetry = () => {
    setParsed(null);
    setTranscription("");
    setParseError("");
    voice.reset();
    setTimeout(() => voice.start(), 100);
  };

  // Modal de confirmación (después de parsear)
  if (parsed) {
    return (
      <VoiceConfirmModal
        parsed={parsed}
        transcription={transcription}
        finance={finance}
        onConfirm={handleConfirm}
        onDiscard={handleDiscard}
        onRetry={handleRetry}
      />
    );
  }

  const bgColor = voice.state === "recording" ? DS.red
                : (voice.state === "transcribing" || parsing) ? DS.amber
                : DS.green;
  const icon = voice.state === "recording" ? "■"
             : (voice.state === "transcribing" || parsing) ? "⋯"
             : "🎤";
  const disabled = voice.state === "transcribing" || parsing;
  const errorMsg = voice.error || parseError;

  return (
    <>
      <button
        onClick={voice.toggle}
        disabled={disabled || !voice.supported}
        style={{
          position: "fixed",
          bottom: 96,
          right: 24,
          width: 64,
          height: 64,
          borderRadius: "50%",
          border: "none",
          background: bgColor,
          color: "#fff",
          fontSize: 24,
          cursor: disabled ? "wait" : "pointer",
          boxShadow: voice.state === "recording"
            ? `0 0 0 8px ${withAlpha(DS.red, "33")}, 0 8px 24px rgba(0,0,0,0.4)`
            : `0 0 0 4px ${withAlpha(DS.green, "33")}, 0 8px 24px rgba(0,0,0,0.4)`,
          zIndex: 9000,
          fontFamily: DS.font,
          transition: "background 0.2s",
          animation: voice.state === "recording" ? "voice-pulse 1.4s ease-in-out infinite" : "none",
        }}
        title={
          voice.state === "idle" ? "Click para capturar transacción por voz"
          : voice.state === "recording" ? `Grabando ${voice.elapsed}s — click para parar`
          : voice.state === "transcribing" ? "Transcribiendo audio…"
          : parsing ? "Parseando transacción…"
          : "Click para grabar"
        }
      >
        {icon}
      </button>

      {/* Timer durante grabación */}
      {voice.state === "recording" && (
        <div style={{
          position: "fixed",
          bottom: 172,
          right: 24,
          padding: "10px 16px",
          background: DS.bgSide,
          border: `1px solid ${withAlpha(DS.red, "55")}`,
          borderRadius: 50,
          color: DS.textPrimary,
          fontSize: 13,
          fontFamily: DS.font,
          fontVariantNumeric: "tabular-nums",
          fontWeight: 600,
          zIndex: 9000,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: "50%", background: DS.red,
            animation: "voice-blink 1s ease-in-out infinite",
          }} />
          <span>{Math.floor(voice.elapsed / 60)}:{String(voice.elapsed % 60).padStart(2, "0")}</span>
          <button
            onClick={voice.cancel}
            style={{
              padding: "3px 10px", borderRadius: 50, border: "none",
              background: "transparent", color: DS.textMuted,
              fontSize: 11, cursor: "pointer", fontFamily: DS.font,
            }}
            title="Cancelar"
          >✕</button>
        </div>
      )}

      {/* Error visible */}
      {errorMsg && (
        <div style={{
          position: "fixed",
          bottom: 172,
          right: 24,
          padding: "12px 16px",
          background: "rgba(226,75,74,0.15)",
          border: "1px solid rgba(226,75,74,0.55)",
          borderRadius: 12,
          color: DS.textPrimary,
          fontSize: 12,
          maxWidth: 320,
          zIndex: 9000,
          fontFamily: DS.font,
        }}>
          <strong style={{ color: DS.red, fontSize: 11 }}>ERROR</strong>
          <div style={{ marginTop: 4 }}>{errorMsg}</div>
          <button
            onClick={() => { voice.reset(); setParseError(""); }}
            style={{
              marginTop: 8,
              padding: "4px 12px",
              borderRadius: 50,
              border: `1px solid ${DS.red}`,
              background: "transparent",
              color: DS.red,
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: DS.font,
            }}
          >Cerrar</button>
        </div>
      )}

      <style>{`
        @keyframes voice-pulse {
          0%, 100% { box-shadow: 0 0 0 8px ${withAlpha(DS.red, "33")}, 0 8px 24px rgba(0,0,0,0.4); }
          50%      { box-shadow: 0 0 0 14px ${withAlpha(DS.red, "11")}, 0 8px 24px rgba(0,0,0,0.4); }
        }
        @keyframes voice-blink {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.3; }
        }
      `}</style>
    </>
  );
}
