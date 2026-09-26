import { useEffect, useState } from "react";
import { DS } from "../lib/design.js";
import { STATES } from "./constants.js";
import { createVariation, updateVariation, deleteVariation } from "./db.js";

// Modal de subir/editar variación. MVP: drive link (no upload de archivo).
// Los clientes no pueden setear "winner" (solo admin).
export function VariationModal({ conceptId, conceptName, variation, suggestedLabel, isAdmin, onClose, onSaved }) {
  const isNew = !variation?.id;
  const [name, setName] = useState(variation?.name || "");
  const [label, setLabel] = useState(variation?.label || suggestedLabel || "A1");
  const [state, setState] = useState(variation?.state || (isNew ? "produced" : "produced"));
  const [driveUrl, setDriveUrl] = useState(variation?.drive_url || "");
  const [metaUrl, setMetaUrl] = useState(variation?.meta_ads_library_url || "");
  const [notes, setNotes] = useState(variation?.notes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", handler);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const statesAvailable = isAdmin
    ? STATES
    : STATES.filter((s) => s.key !== "winner"); // cliente no marca winner

  const save = async () => {
    if (!label.trim()) { setError("Pon una etiqueta (ej. A1)."); return; }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        label: label.trim(),
        name: name.trim() || null,
        state,
        drive_url: driveUrl.trim() || null,
        meta_ads_library_url: metaUrl.trim() || null,
        notes: notes.trim() || null,
      };
      if (isNew) {
        await createVariation({ ...payload, concept_id: conceptId });
      } else {
        await updateVariation(variation.id, payload);
      }
      await onSaved?.();
      onClose?.();
    } catch (e) {
      setError(e?.message || String(e));
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("¿Eliminar esta variación? No se puede deshacer.")) return;
    setSaving(true);
    try {
      await deleteVariation(variation.id);
      await onSaved?.();
      onClose?.();
    } catch (e) {
      setError(e?.message || String(e));
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        fontFamily: DS.font,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: DS.bg,
          border: DS.border,
          borderRadius: DS.radius,
          width: "100%",
          maxWidth: 520,
          padding: "24px 28px",
          color: DS.textPrimary,
        }}
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: DS.textMuted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>
            {conceptName || "Concepto"}
          </div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>
            {isNew ? "Nueva variación" : `Editar ${variation.label}`}
          </div>
        </div>

        <Row label="Etiqueta" hint="A1, A2, B1… identificador corto">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={10}
            style={inputStyle()}
          />
        </Row>

        <Row label="Nombre / hook" hint="Descripción corta del ángulo o gancho">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="Ej: Mamá mostrando antes/después"
            style={inputStyle()}
          />
        </Row>

        <Row label="Link de Drive">
          <input
            value={driveUrl}
            onChange={(e) => setDriveUrl(e.target.value)}
            placeholder="https://drive.google.com/..."
            style={inputStyle()}
          />
        </Row>

        <Row label="Link Biblioteca de Anuncios Meta (opcional)">
          <input
            value={metaUrl}
            onChange={(e) => setMetaUrl(e.target.value)}
            placeholder="https://facebook.com/ads/library/..."
            style={inputStyle()}
          />
        </Row>

        <Row label="Estado">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {statesAvailable.map((s) => {
              const active = state === s.key;
              return (
                <button
                  key={s.key}
                  onClick={() => setState(s.key)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 50,
                    border: active ? `1.5px solid ${s.color === "transparent" ? "#3A3F3C" : s.color}` : DS.border,
                    background: active && s.color !== "transparent" ? `${s.color}22` : "transparent",
                    color: active ? (s.color === "transparent" ? DS.textSecondary : s.color) : DS.textMuted,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: DS.font,
                  }}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </Row>

        <Row label="Notas (opcional)">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            style={{ ...inputStyle(), resize: "vertical", minHeight: 60, fontFamily: DS.font }}
            placeholder="Aprendizajes, comentarios, contexto…"
          />
        </Row>

        {error && (
          <div style={{ color: "#E24B4A", fontSize: 12, marginBottom: 10 }}>{error}</div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 18, paddingTop: 14, borderTop: DS.border }}>
          <div>
            {!isNew && (
              <button
                onClick={handleDelete}
                disabled={saving}
                style={{
                  padding: "9px 16px",
                  borderRadius: 50,
                  border: DS.border,
                  background: "transparent",
                  color: "#E24B4A",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Eliminar
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={onClose}
              disabled={saving}
              style={{
                padding: "9px 16px",
                borderRadius: 50,
                border: DS.border,
                background: "transparent",
                color: DS.textSecondary,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Cancelar
            </button>
            <button
              onClick={save}
              disabled={saving}
              style={{
                padding: "9px 22px",
                borderRadius: 50,
                border: "none",
                background: "#1D9E75",
                color: "#fff",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? "Guardando…" : isNew ? "Crear" : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: DS.textSecondary, fontWeight: 500, marginBottom: 4 }}>
        {label}
      </div>
      {hint && <div style={{ fontSize: 10, color: DS.textMuted, marginBottom: 6 }}>{hint}</div>}
      {children}
    </div>
  );
}

function inputStyle() {
  return {
    width: "100%",
    padding: "9px 12px",
    borderRadius: 8,
    border: DS.border,
    background: DS.bgCard,
    color: DS.textPrimary,
    fontSize: 13,
    fontFamily: "inherit",
    outline: "none",
    boxSizing: "border-box",
  };
}
