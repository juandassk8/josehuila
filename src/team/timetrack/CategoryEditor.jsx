// Modal CRUD de categorías. Mismo patrón visual que TaskModal (overlay
// fixed + card centrada).

import { useState, useEffect } from "react";
import { DS } from "../../lib/design.js";

const PALETTE = [
  "#8B5CF6", // purple
  "#378ADD", // blue
  "#1DB97A", // green
  "#F5A623", // amber
  "#E24B4A", // red
  "#EC4899", // pink
  "#06B6D4", // cyan
  "#F97316", // orange
  "#6B7280", // gray
];

const ICONS = ["⏱", "✨", "🏢", "🎯", "📚", "💪", "🎨", "🧠", "🌱", "🔥", "🎬", "✍️", "💼", "🏃", "🍳", "🛠"];

export function CategoryEditor({ category, onSave, onArchive, onClose }) {
  const isEdit = !!category;
  const [name, setName] = useState(category?.name || "");
  const [color, setColor] = useState(category?.color || PALETTE[0]);
  const [icon, setIcon] = useState(category?.icon || "⏱");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Ponle un nombre");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave({ name: trimmed, color, icon });
      onClose?.();
    } catch (err) {
      setError(err?.message || "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 20px",
        zIndex: 9999,
        fontFamily: DS.font,
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          background: DS.bgSide,
          borderRadius: 16,
          maxWidth: 460,
          width: "100%",
          padding: "26px 28px 22px",
          border: DS.border,
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", marginBottom: 18 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: DS.textPrimary, flex: 1 }}>
            {isEdit ? "Editar categoría" : "Nueva categoría"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: DS.textMuted,
              fontSize: 18,
              cursor: "pointer",
              padding: "0 4px",
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        <Field label="Nombre">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ej. Marca personal"
            style={{
              width: "100%",
              padding: "11px 14px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.04)",
              color: DS.textPrimary,
              fontSize: 14,
              fontFamily: DS.font,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </Field>

        <Field label="Color">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: c,
                  border: c === color ? "2px solid #fff" : "2px solid transparent",
                  boxShadow: c === color ? `0 0 0 2px ${c}` : "none",
                  cursor: "pointer",
                }}
                aria-label={c}
              />
            ))}
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              title="Color personalizado"
              style={{
                width: 28,
                height: 28,
                padding: 0,
                border: "1px solid rgba(255,255,255,0.10)",
                borderRadius: "50%",
                cursor: "pointer",
                background: "transparent",
              }}
            />
          </div>
        </Field>

        <Field label="Ícono">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {ICONS.map((ic) => (
              <button
                key={ic}
                type="button"
                onClick={() => setIcon(ic)}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  border: ic === icon ? `1px solid ${color}` : `1px solid ${DS.textHint}`,
                  background: ic === icon ? "rgba(255,255,255,0.05)" : "transparent",
                  fontSize: 16,
                  cursor: "pointer",
                  color: DS.textPrimary,
                }}
              >
                {ic}
              </button>
            ))}
          </div>
        </Field>

        {error && (
          <div style={{ color: DS.red, fontSize: 12, marginBottom: 10 }}>{error}</div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          {isEdit && onArchive && (
            <button
              type="button"
              onClick={async () => {
                if (!confirm("¿Archivar esta categoría? Las sesiones pasadas quedan intactas.")) return;
                await onArchive(category.id);
                onClose?.();
              }}
              style={{
                padding: "10px 16px",
                borderRadius: 50,
                border: `1px solid ${DS.textHint}`,
                background: "transparent",
                color: DS.red,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                fontFamily: DS.font,
              }}
            >
              Archivar
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "10px 18px",
              borderRadius: 50,
              border: `1px solid ${DS.textHint}`,
              background: "transparent",
              color: DS.textSecondary,
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
              fontFamily: DS.font,
            }}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            style={{
              padding: "10px 22px",
              borderRadius: 50,
              border: "none",
              background: color,
              color: "#fff",
              cursor: saving ? "wait" : "pointer",
              fontSize: 13,
              fontWeight: 700,
              fontFamily: DS.font,
              letterSpacing: "0.02em",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "Guardando…" : isEdit ? "Guardar" : "Crear"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.16em",
          color: DS.textMuted,
          fontWeight: 700,
          marginBottom: 8,
        }}
      >
        {label.toUpperCase()}
      </div>
      {children}
    </div>
  );
}
