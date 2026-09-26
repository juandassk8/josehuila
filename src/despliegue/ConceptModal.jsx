import { useEffect, useState } from "react";
import { DS } from "../lib/design.js";
import { createConcept, updateConcept, archiveConcept } from "./db.js";
import { STAGES, FORMATS } from "./constants.js";

// Modal admin para crear/editar concepto. Campos mínimos: nombre, descripción,
// etapa, formato. La meta semanal se ajusta luego desde el modal de edición.
export function ConceptModal({ boardId, concept, defaultStage = "tofu", defaultFormat = "static", defaultOrderIndex = 0, onClose, onCreated, onUpdated, onArchived }) {
  const isNew = !concept?.id;
  const [name, setName] = useState(concept?.name || "");
  const [description, setDescription] = useState(concept?.description || "");
  const [stage, setStage] = useState(concept?.stage || defaultStage);
  const [format, setFormat] = useState(concept?.format || defaultFormat);
  const [weeklyTarget, setWeeklyTarget] = useState(String(concept?.weekly_target ?? 3));
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const save = async () => {
    if (!name.trim()) { setError("Ponle nombre al concepto."); return; }
    const target = parseInt(weeklyTarget, 10) || 3;
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        stage,
        format,
        weekly_target: target,
      };
      if (isNew) {
        const created = await createConcept({ ...payload, board_id: boardId, order_index: defaultOrderIndex });
        onCreated?.(created);
      } else {
        const updated = await updateConcept(concept.id, payload);
        onUpdated?.(updated || { id: concept.id, ...payload });
      }
      onClose?.();
    } catch (e) {
      setError(e?.message || String(e));
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!confirm("¿Archivar este concepto? Las referencias quedan guardadas pero el concepto no aparece más.")) return;
    setSaving(true);
    try {
      await archiveConcept(concept.id);
      onArchived?.(concept.id);
      onClose?.();
    } catch (e) {
      setError(e?.message || String(e));
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      data-modal
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
        zIndex: 10001, display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20, fontFamily: DS.font,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: DS.bg, border: DS.border, borderRadius: DS.radius,
          width: "100%", maxWidth: 520, padding: "24px 28px", color: DS.textPrimary,
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>
          {isNew ? "Nuevo concepto" : "Editar concepto"}
        </div>

        <Row label="Nombre del concepto" hint="Ej: Curiosidad, Problema y solución, Testimonial vivo">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre del ángulo"
            style={inputStyle()}
            autoFocus
          />
        </Row>

        <Row label="Descripción" hint="Explicación corta del concepto, público y ángulo narrativo">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Ej: Hook directo a mamás con curiosidad sobre resultados reales de otras usuarias"
            style={{ ...inputStyle(), resize: "vertical", minHeight: 70, fontFamily: DS.font }}
          />
        </Row>

        <Row label="Etapa del funnel">
          <div style={{ display: "flex", gap: 6 }}>
            {STAGES.map((s) => (
              <button
                key={s.key}
                onClick={() => setStage(s.key)}
                style={pillStyle(stage === s.key, s.color)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </Row>

        <Row label="Formato">
          <div style={{ display: "flex", gap: 6 }}>
            {FORMATS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFormat(f.key)}
                style={pillStyle(format === f.key, "#3B8BD4")}
              >
                {f.label}
              </button>
            ))}
          </div>
        </Row>

        <div style={{ marginTop: 6, marginBottom: 14 }}>
          <button
            onClick={() => setShowAdvanced((v) => !v)}
            style={{
              background: "transparent", border: "none",
              color: DS.textMuted, fontSize: 11, cursor: "pointer",
              textDecoration: "underline", fontFamily: DS.font, padding: 0,
            }}
          >
            {showAdvanced ? "− Ocultar meta semanal" : "+ Meta semanal (opcional)"}
          </button>
        </div>

        {showAdvanced && (
          <Row label="Meta semanal" hint="Para tracking de cumplimiento (se ajusta luego)">
            <input
              type="number"
              min={1}
              max={20}
              value={weeklyTarget}
              onChange={(e) => setWeeklyTarget(e.target.value)}
              style={{ ...inputStyle(), width: 100 }}
            />
          </Row>
        )}

        {error && <div style={{ color: "#E24B4A", fontSize: 12, marginBottom: 10 }}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 18, paddingTop: 14, borderTop: DS.border }}>
          <div>
            {!isNew && (
              <button
                onClick={handleArchive}
                disabled={saving}
                style={{
                  padding: "9px 16px", borderRadius: 50, border: DS.border,
                  background: "transparent", color: "#E24B4A",
                  fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}
              >
                Archivar
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={onClose}
              disabled={saving}
              style={{
                padding: "9px 16px", borderRadius: 50, border: DS.border,
                background: "transparent", color: DS.textSecondary,
                fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}
            >
              Cancelar
            </button>
            <button
              onClick={save}
              disabled={saving}
              style={{
                padding: "9px 22px", borderRadius: 50, border: "none",
                background: "#1D9E75", color: "#fff",
                fontSize: 12, fontWeight: 700, cursor: "pointer",
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? "Guardando…" : isNew ? "Crear concepto" : "Guardar"}
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
      <div style={{ fontSize: 11, color: DS.textSecondary, fontWeight: 500, marginBottom: 4 }}>{label}</div>
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

function pillStyle(active, accent) {
  return {
    padding: "6px 14px",
    borderRadius: 50,
    border: active ? `1.5px solid ${accent}` : DS.border,
    background: active ? `${accent}22` : "transparent",
    color: active ? accent : DS.textSecondary,
    fontSize: 11, fontWeight: 600, cursor: "pointer",
    fontFamily: "inherit",
  };
}
