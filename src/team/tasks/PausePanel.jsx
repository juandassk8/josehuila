import { useState } from "react";
import { DS } from "../../lib/design.js";

// Panel de pausa: Descanso (un toque) o Inconveniente (abre una nota que se puede
// llenar ahora o después, en Mi rutina → Reportes). También "Terminé la tarea".
// onStop({ endKind, pauseKind, reason })
export function PausePanel({ onStop }) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");

  const label = { fontSize: 9, fontWeight: 700, color: DS.textMuted, letterSpacing: "0.14em", textTransform: "uppercase" };
  const big = (color) => ({
    flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "12px 8px", borderRadius: 12,
    border: `1px solid ${color}66`, background: `${color}14`, color: DS.textPrimary, cursor: "pointer", fontFamily: DS.font,
  });
  const small = { fontSize: 10.5, color: DS.textMuted, fontWeight: 500 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, fontFamily: DS.font }}>
      <div style={label}>¿Por qué pausas?</div>
      {!noteOpen ? (
        <div style={{ display: "flex", gap: 8 }}>
          <button data-nodrag onClick={() => onStop({ endKind: "pausa", pauseKind: "descanso", reason: null })} style={big(DS.green)}>
            <span style={{ fontSize: 20, lineHeight: 1 }}>☕</span>
            <span style={{ fontSize: 12.5, fontWeight: 800 }}>Descanso</span>
            <span style={small}>Pausa planeada</span>
          </button>
          <button data-nodrag onClick={() => setNoteOpen(true)} style={big(DS.amber)}>
            <span style={{ fontSize: 20, lineHeight: 1 }}>⚠️</span>
            <span style={{ fontSize: 12.5, fontWeight: 800 }}>Interrupción</span>
            <span style={small}>Algo me sacó</span>
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <textarea
            data-nodrag autoFocus rows={3} maxLength={280} value={note} placeholder="¿Cuál fue la interrupción? (puedes llenarlo después)"
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onStop({ endKind: "pausa", pauseKind: "inconveniente", reason: note }); }}
            style={{
              width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 9, border: `1px solid ${DS.amber}88`,
              background: "transparent", color: DS.textPrimary, fontSize: 12.5, fontFamily: DS.font, outline: "none", resize: "vertical",
            }}
          />
          <div style={{ display: "flex", gap: 6 }}>
            <button data-nodrag onClick={() => onStop({ endKind: "pausa", pauseKind: "inconveniente", reason: note })} style={{
              flex: 1, padding: "8px 10px", borderRadius: 9, border: "none", background: DS.textPrimary, color: DS.bg,
              fontSize: 12, fontWeight: 700, fontFamily: DS.font, cursor: "pointer",
            }}>{note.trim() ? "Pausar y guardar nota" : "Pausar, anoto después"}</button>
            <button data-nodrag onClick={() => setNoteOpen(false)} style={{
              padding: "8px 10px", borderRadius: 9, border: `1px solid ${DS.textHint}`, background: "transparent", color: DS.textSecondary,
              fontSize: 12, fontWeight: 700, fontFamily: DS.font, cursor: "pointer",
            }}>←</button>
          </div>
        </div>
      )}
      <button data-nodrag onClick={() => onStop({ endKind: "pausa", pauseKind: null, reason: "Sigo después" })} style={{
        padding: "8px 10px", borderRadius: 9, border: `1px solid ${DS.textHint}`, background: "transparent", color: DS.textPrimary,
        fontSize: 12, fontWeight: 700, fontFamily: DS.font, cursor: "pointer",
      }} title="Deja la tarea pausada sin contarlo como descanso ni interrupción (por ejemplo, porque empezó el almuerzo)">⏸ Pausar, sigo después</button>
      <button data-nodrag onClick={() => onStop({ endKind: "terminada", pauseKind: null, reason: null })} style={{
        padding: "8px 10px", borderRadius: 9, border: `1px solid ${DS.green}66`, background: "transparent", color: DS.green,
        fontSize: 12, fontWeight: 700, fontFamily: DS.font, cursor: "pointer",
      }}>✓ Terminé la tarea</button>
    </div>
  );
}
