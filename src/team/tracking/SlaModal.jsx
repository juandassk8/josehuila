import { useState } from "react";
import { DS, darkBtn, darkBtnGhost, darkInput } from "../../lib/design.js";
import { isoDate } from "../../lib/weeks.js";

const DAY_LABELS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export function SlaModal({
  date,
  items,          // existing sla_support rows for this day (usamos el primero como nota)
  companyName,
  currentMember,
  defaultOwnerId,
  onUpsertNote,   // (payload) => void
  onClose,
}) {
  const existing = items?.[0] || null;
  const [text, setText] = useState(existing?.question || "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const dayOfWeek = (date.getDay() + 6) % 7;

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onUpsertNote({
        id: existing?.id || null,
        day_date: isoDate(date),
        question: text.trim(),
        owner_id: existing?.owner_id || defaultOwnerId || currentMember?.id || null,
      });
      onClose();
    } catch (err) {
      setSaveError(err?.message || "No se pudo guardar la duda. Probá de nuevo.");
      setSaving(false);
    }
  };

  const panelStyle = {
    background: DS.bg,
    border: DS.border,
    borderRadius: 14,
    padding: 22,
    fontFamily: DS.font,
    color: DS.textPrimary,
    boxShadow: "0 10px 40px rgba(0,0,0,0.35)",
  };

  return (
    <Backdrop onClose={onClose}>
      <div style={panelStyle}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: DS.textMuted, letterSpacing: "0.16em", textTransform: "uppercase" }}>
            {companyName} · {DAY_LABELS[dayOfWeek]}
          </div>
          <div style={{ fontSize: 16, color: DS.textPrimary, fontWeight: 700 }}>
            🆘 SOS — Soporte del día
          </div>
          <div style={{ fontSize: 11, color: DS.textSecondary, marginTop: 4 }}>
            Registra las dudas del cliente durante el día y cómo se resolvieron.
          </div>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ej: Cliente preguntó por el píxel a las 10am — se le explicó que estaba bien configurado y se envió screenshot. Duda sobre CPM alto resuelto explicando la nueva audiencia..."
          rows={8}
          style={{ ...darkInput, padding: "12px 14px", resize: "vertical", fontFamily: DS.font, fontSize: 13, lineHeight: 1.6 }}
        />

        {saveError && (
          <div style={{
            marginTop: 12, padding: "10px 12px", borderRadius: 8,
            background: "rgba(226,75,74,0.12)", border: "1px solid rgba(226,75,74,0.3)",
            color: "#E24B4A", fontSize: 12, fontWeight: 600, lineHeight: 1.45,
          }}>
            ⚠ {saveError}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button onClick={onClose} disabled={saving} style={{ ...darkBtnGhost, opacity: saving ? 0.5 : 1 }}>Cancelar</button>
          <button onClick={handleSave} disabled={saving} style={{ ...darkBtn, opacity: saving ? 0.5 : 1, cursor: saving ? "wait" : "pointer" }}>
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </Backdrop>
  );
}

function Backdrop({ children, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20,
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 560 }}>
        {children}
      </div>
    </div>
  );
}
