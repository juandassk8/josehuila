import { useState } from "react";
import { DS, darkBtn, darkBtnGhost, darkBtnRed, darkInput } from "../../lib/design.js";
import { CONTENT_STATUS, CONTENT_CATEGORIES, REFERENCE_TYPES } from "./trackingStatus.js";

export function ContenidoCellModal({
  mode, // "create" | "edit"
  milestone,      // for edit
  category,       // for create
  dayOfWeek,      // for create
  companyName,
  members,
  currentMember,
  defaultOwnerId,
  onSave,
  onDelete,
  onClose,
}) {
  const isEdit = mode === "edit";
  const initial = milestone || {};
  const [status, setStatus] = useState(initial.status || "no_ejecutado");
  const [ownerId, setOwnerId] = useState(initial.owner_id || defaultOwnerId || currentMember?.id || null);
  const [linkUrl, setLinkUrl] = useState(initial.link_url || "");
  const [note, setNote] = useState(initial.note || "");
  const [referenceType, setReferenceType] = useState(initial.reference_type || null);

  const cat = CONTENT_CATEGORIES.find((c) => c.key === (initial.category || category));
  const isReferencias = cat?.key === "referencias";
  const dow = initial.day_of_week || dayOfWeek;
  const dayLabels = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

  const completedAtStr = initial.completed_at
    ? new Date(initial.completed_at).toLocaleString("es-CO", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })
    : null;

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    const payload = {
      status,
      owner_id: ownerId,
      link_url: linkUrl || null,
      note: note || null,
      reference_type: isReferencias ? referenceType : null,
    };
    if (!isEdit && (status === "aprobado" || status === "enviado")) {
      payload.completed_at = new Date().toISOString();
    }
    if (isEdit && (status === "aprobado" || status === "enviado") && !initial.completed_at) {
      payload.completed_at = new Date().toISOString();
    }
    try {
      await onSave(payload);
      onClose();
    } catch (err) {
      // No cerramos el modal — el user puede ajustar y reintentar.
      setSaveError(err?.message || "No se pudo guardar. Probá de nuevo.");
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (saving) return;
    if (!confirm("¿Eliminar este hito? No se puede deshacer.")) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onDelete?.();
      onClose();
    } catch (err) {
      setSaveError(err?.message || "No se pudo eliminar.");
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
      <form onSubmit={handleSubmit} style={panelStyle}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 18 }}>
          <span style={{ fontSize: 20 }}>{cat?.icon}</span>
          <div>
            <div style={{ fontSize: 10, color: DS.textMuted, letterSpacing: "0.16em", textTransform: "uppercase" }}>
              {companyName} · {dayLabels[dow - 1]}
            </div>
            <div style={{ fontSize: 16, color: DS.textPrimary, fontWeight: 700 }}>
              {cat?.label}
            </div>
          </div>
        </div>

        <Field label="Estado">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
            {CONTENT_STATUS.map((s) => {
              const active = status === s.key;
              // Mismo patrón que contentStatusColor — hex tiene prioridad
              // para que el alpha-append (`${color}22`) no rompa con rgba.
              const color = s.colorHex || DS[s.color] || "#6B7280";
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setStatus(s.key)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: `1px solid ${active ? color : DS.textHint}`,
                    background: active ? `${color}22` : "transparent",
                    color: active ? DS.textPrimary : DS.textSecondary,
                    fontSize: 11,
                    fontWeight: 600,
                    fontFamily: DS.font,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    justifyContent: "flex-start",
                  }}
                >
                  <span style={{ color }}>{s.icon}</span>
                  {s.label}
                </button>
              );
            })}
          </div>
        </Field>

        {isReferencias && (
          <Field label="Tipo de referencia">
            <div style={{ display: "flex", gap: 6 }}>
              {REFERENCE_TYPES.map((t) => {
                const active = referenceType === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setReferenceType(active ? null : t.key)}
                    style={{
                      flex: 1,
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: `1px solid ${active ? DS.blue : DS.textHint}`,
                      background: active ? `${DS.blue}22` : "transparent",
                      color: active ? DS.textPrimary : DS.textSecondary,
                      fontSize: 12,
                      fontWeight: 600,
                      fontFamily: DS.font,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      justifyContent: "center",
                    }}
                  >
                    <span>{t.icon}</span>
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>
          </Field>
        )}

        <Field label="Owner">
          <select
            value={ownerId || ""}
            onChange={(e) => setOwnerId(e.target.value || null)}
            style={{ ...darkInput, padding: "9px 12px" }}
          >
            <option value="">— Sin asignar —</option>
            {members?.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </Field>

        {completedAtStr && (
          <div style={{ fontSize: 11, color: DS.textMuted, marginBottom: 14 }}>
            Completado: {completedAtStr}
          </div>
        )}

        <Field label="Link (Loom / Drive / etc.)">
          <input
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://…"
            style={{ ...darkInput, padding: "9px 12px" }}
          />
        </Field>

        <Field label="Nota">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Observaciones, comentarios del cliente, etc."
            rows={3}
            style={{ ...darkInput, padding: "9px 12px", resize: "vertical", fontFamily: DS.font }}
          />
        </Field>

        {saveError && (
          <div style={{
            marginTop: 8, padding: "10px 12px", borderRadius: 8,
            background: "rgba(226,75,74,0.12)", border: "1px solid rgba(226,75,74,0.3)",
            color: "#E24B4A", fontSize: 12, fontWeight: 600, lineHeight: 1.45,
          }}>
            ⚠ {saveError}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 18, justifyContent: "space-between" }}>
          <div>
            {isEdit && (
              <button type="button" disabled={saving} onClick={handleDelete} style={{ ...darkBtnRed, opacity: saving ? 0.5 : 1 }}>
                Eliminar
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" disabled={saving} onClick={onClose} style={{ ...darkBtnGhost, opacity: saving ? 0.5 : 1 }}>Cancelar</button>
            <button type="submit" disabled={saving} style={{ ...darkBtn, opacity: saving ? 0.6 : 1, cursor: saving ? "wait" : "pointer" }}>
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      </form>
    </Backdrop>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10, color: DS.textMuted, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function Backdrop({ children, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
        padding: 20,
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 520 }}>
        {children}
      </div>
    </div>
  );
}
