// Modal chico para guardar el escenario actual. Se monta encima del modal
// principal del simulador.

import { useState } from "react";

export function SaveScenarioDialog({
  T, isDark,
  defaultName = "",
  defaultDescription = "",
  canOverwrite = false,
  onSave,
  onClose,
}) {
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState(defaultDescription);
  const [overwrite, setOverwrite] = useState(canOverwrite);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const handleSave = async () => {
    if (!name.trim()) { setErr("Ponele un nombre al escenario."); return; }
    setSaving(true);
    setErr("");
    try {
      await onSave({ name: name.trim(), description: description.trim(), overwrite });
      onClose?.();
    } catch (e) {
      const detail = e?.message || e?.hint || String(e);
      setErr(`No se pudo guardar: ${detail}`);
    } finally {
      setSaving(false);
    }
  };

  const bg = isDark ? "#0E0E14" : "#FFFFFF";
  const border = isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.08)";

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 10010,
        background: "rgba(0,0,0,0.65)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20, fontFamily: T.font,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 460,
          background: bg, border, borderRadius: 14,
          padding: "20px 22px", color: T.textPrimary,
          display: "flex", flexDirection: "column", gap: 12,
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 700 }}>Guardar escenario</div>

        <div>
          <Label T={T}>Nombre</Label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Plan Q2 — agresivo con producción top"
            autoFocus
            style={inputStyle(T, isDark)}
          />
        </div>

        <div>
          <Label T={T}>Descripción (opcional)</Label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Notas, contexto, supuestos…"
            rows={3}
            style={{ ...inputStyle(T, isDark), resize: "vertical" }}
          />
        </div>

        {canOverwrite && (
          <label style={{
            display: "flex", alignItems: "center", gap: 8,
            fontSize: 12, color: T.textSecondary, cursor: "pointer",
          }}>
            <input
              type="checkbox"
              checked={overwrite}
              onChange={(e) => setOverwrite(e.target.checked)}
            />
            Sobreescribir el escenario actual (en vez de crear uno nuevo)
          </label>
        )}

        {err && (
          <div style={{
            padding: "8px 10px", borderRadius: 8,
            background: "rgba(226,75,74,0.12)", border: "1px solid rgba(226,75,74,0.30)",
            color: "#E24B4A", fontSize: 12, lineHeight: 1.5,
          }}>
            ⚠️ {err}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 14px", borderRadius: 50,
              background: "transparent", color: T.textSecondary,
              border: `1px solid ${T.textHint}`,
              fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: T.font,
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "8px 18px", borderRadius: 50, border: "none",
              background: isDark ? "#EBEBEB" : "#1A1D1C",
              color: isDark ? "#1A1D1C" : "#FFFFFF",
              fontSize: 12, fontWeight: 700, cursor: saving ? "wait" : "pointer",
              fontFamily: T.font, opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Label({ children, T }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
      textTransform: "uppercase", color: T.textMuted, marginBottom: 6,
    }}>
      {children}
    </div>
  );
}

function inputStyle(T, isDark) {
  return {
    width: "100%", boxSizing: "border-box",
    padding: "10px 12px", borderRadius: 10,
    border: `1px solid ${T.textHint}`,
    background: isDark ? "rgba(255,255,255,0.02)" : "#FDFDFB",
    color: T.textPrimary, fontSize: 13, fontFamily: T.font,
    outline: "none", lineHeight: 1.5,
  };
}
