import { useEffect, useMemo, useState } from "react";
import { DS, withAlpha } from "../../lib/design.js";
import { LabelEditor } from "../../despliegue/ReferenceLabelUI.jsx";
import { suggestionsByCategory } from "../../despliegue/labels.js";

const STAGE_OPTS = [
  { key: "", label: "— sin cambio" },
  { key: "tofu", label: "TOFU", color: DS.blue },
  { key: "mofu", label: "MOFU", color: DS.amber },
  { key: "bofu", label: "BOFU", color: DS.green },
];
const MEDIA_OPTS = [
  { key: "", label: "— sin cambio" },
  { key: "video", label: "Video" },
  { key: "static", label: "Estático" },
];

// Clasificar/etiquetar en lote varios referentes durante la revisión.
// Todo opcional: lo que dejes vacío no se toca. Las etiquetas se SUMAN.
export function ClassifyRefsModal({ count, onClose, onApply }) {
  const [labels, setLabels] = useState({});
  // Sumar vs pisar. Sumar es lo correcto cuando estás completando una ficha a la
  // que le falta algo; pisar es lo correcto cuando la IA se EQUIVOCÓ en tanda y
  // el valor que ya está es falso. Sin esto, corregir 80 anuncios de muebles los
  // dejaba en ["Salud", "Muebles"]: el error seguía adentro.
  const [reemplazar, setReemplazar] = useState(false);
  const [stage, setStage] = useState("");
  const [mediaType, setMediaType] = useState("");
  const [format, setFormat] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const suggestions = useMemo(() => suggestionsByCategory([]), []);

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape" && !saving) onClose?.(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, saving]);

  const apply = async () => {
    setSaving(true); setError(null);
    try {
      await onApply({ addLabels: labels, stage: stage || null, mediaType: mediaType || null, format: format || null, reemplazar });
      onClose?.();
    } catch (e) {
      setError(e?.message || String(e));
      setSaving(false);
    }
  };

  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose?.(); }}
      style={{ position: "fixed", inset: 0, zIndex: 10003, background: "rgba(0,0,0,0.82)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: DS.font }}>
      <div onMouseDown={(e) => e.stopPropagation()}
        style={{ width: "min(560px, 96vw)", maxHeight: "92vh", background: DS.bgSide, border: `1px solid ${DS.textHint}`, borderRadius: 16, color: DS.textPrimary, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 30px 90px rgba(0,0,0,0.6)" }}>
        <div style={{ padding: "16px 22px 12px", borderBottom: `1px solid ${DS.textHint}`, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: DS.textMuted, marginBottom: 5 }}>Clasificar en lote</div>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Etiquetar {count} referente(s)</h3>
          </div>
          <button onClick={onClose} disabled={saving} style={{ width: 30, height: 30, borderRadius: 8, border: DS.border, background: "transparent", color: DS.textSecondary, cursor: "pointer", fontSize: 16 }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 22px 20px" }}>
          <div style={{ fontSize: 11, color: DS.textMuted, marginBottom: 14 }}>
            Todo es opcional — lo que dejes vacío no se toca. Las etiquetas se <b>suman</b> a las que ya tengan.
          </div>

          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 14 }}>
            <Field label="Etapa">
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {STAGE_OPTS.map((s) => (
                  <Pill key={s.key} active={stage === s.key} color={s.color || DS.textSecondary} onClick={() => setStage(s.key)}>{s.label}</Pill>
                ))}
              </div>
            </Field>
            <Field label="Tipo">
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {MEDIA_OPTS.map((m) => (
                  <Pill key={m.key} active={mediaType === m.key} color={DS.textSecondary} onClick={() => setMediaType(m.key)}>{m.label}</Pill>
                ))}
              </div>
            </Field>
          </div>

          <Field label="Formato (opcional, sobreescribe)">
            <input value={format} onChange={(e) => setFormat(e.target.value)} placeholder="Ej: B-roll voz en off"
              style={inputStyle} />
          </Field>

          <Field label={reemplazar
            ? "Etiquetas a REEMPLAZAR (marca · nicho · ángulo · formato)"
            : "Etiquetas a sumar (marca · nicho · ángulo · formato)"}>
            <LabelEditor value={labels} onChange={setLabels} suggestions={suggestions} />
            <label style={{ display: "flex", alignItems: "flex-start", gap: 9, marginTop: 12, cursor: "pointer" }}>
              <input type="checkbox" checked={reemplazar} onChange={(e) => setReemplazar(e.target.checked)}
                style={{ width: 15, height: 15, marginTop: 1, accentColor: DS.amber, flex: "none" }} />
              <span style={{ fontSize: 12, lineHeight: 1.5, color: DS.textSecondary }}>
                <b style={{ color: DS.textPrimary, fontWeight: 700 }}>Reemplazar lo que ya tienen</b>
                <span style={{ display: "block", color: DS.textMuted, marginTop: 2 }}>
                  {reemplazar
                    ? "En las categorías que completes abajo, se borra lo anterior y queda solo esto. Para cuando la etiqueta vieja está mal."
                    : "Apagado: lo nuevo se suma a lo que ya tenían."}
                </span>
              </span>
            </label>
          </Field>

          {error && <div style={{ color: "#E24B4A", fontSize: 12, marginTop: 8 }}>{error}</div>}
        </div>

        <div style={{ padding: "12px 22px", borderTop: `1px solid ${DS.textHint}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} disabled={saving} style={ghostBtn}>Cancelar</button>
          <button onClick={apply} disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.55 : 1 }}>
            {saving ? "Aplicando…" : `Aplicar a ${count}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function Pill({ children, active, color, onClick }) {
  const c = color || DS.textSecondary;
  return (
    <button onClick={onClick} style={{
      padding: "6px 12px", borderRadius: 50, cursor: "pointer", fontFamily: DS.font, fontSize: 11, fontWeight: 700,
      border: active ? `1.5px solid ${c}` : DS.border,
      background: active ? withAlpha(c, "22") : "transparent",
      color: active ? c : DS.textMuted,
    }}>{children}</button>
  );
}
function Field({ label, children, style }) {
  return (
    <div style={{ marginBottom: 14, ...style }}>
      <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: DS.textMuted, fontWeight: 700, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}
const inputStyle = { width: "100%", padding: "9px 12px", borderRadius: 8, border: DS.border, background: DS.bgCard, color: DS.textPrimary, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" };
const primaryBtn = { padding: "9px 22px", borderRadius: 50, border: "none", background: "#1D9E75", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: DS.font };
const ghostBtn = { padding: "9px 16px", borderRadius: 50, border: DS.border, background: "transparent", color: DS.textSecondary, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: DS.font };
