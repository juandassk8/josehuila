import { useEffect, useMemo, useRef, useState } from "react";
import { DS } from "../../lib/design.js";
import { createBankConcept } from "./db.js";

const STAGES = [
  { key: "tofu", label: "TOFU", color: DS.blue },
  { key: "mofu", label: "MOFU", color: DS.amber },
  { key: "bofu", label: "BOFU", color: DS.green },
];
const FORMATS = [
  { key: "static", label: "Estático" },
  { key: "video", label: "Video" },
];

const normTag = (t) => (t || "").trim().replace(/\s+/g, " ");

// Modal para crear un concepto NUEVO directo en el banco (bucket "Banco de
// referencias"). El pipeline (ads | organic) lo hereda del board activo.
export function AddConceptModal({ pipelineType = "ads", existingTags = [], onClose, onCreated }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [execution, setExecution] = useState("");
  const [format, setFormat] = useState("static");
  const [stage, setStage] = useState("tofu");
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const downOnBackdrop = useRef(false);

  const isDirty = !!(name || description || execution || tags.length);
  const requestClose = () => {
    if (isDirty && !confirm("Tenés datos sin guardar. ¿Salir igual?")) return;
    onClose?.();
  };

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") requestClose(); };
    window.addEventListener("keydown", handler);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty]);

  const tagSuggestions = useMemo(() => {
    const set = new Set(existingTags.map(normTag).filter(Boolean));
    for (const t of tags) set.delete(t);
    return Array.from(set).sort();
  }, [existingTags, tags]);

  const addTag = (raw) => {
    const t = normTag(raw);
    if (!t) return;
    setTags((prev) => (prev.some((x) => x.toLowerCase() === t.toLowerCase()) ? prev : [...prev, t]));
    setTagInput("");
  };
  const removeTag = (t) => setTags((prev) => prev.filter((x) => x !== t));
  const onTagKeyDown = (e) => {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(tagInput); }
    else if (e.key === "Backspace" && !tagInput && tags.length) removeTag(tags[tags.length - 1]);
  };

  const save = async () => {
    if (!name.trim()) { setError("Ponele un nombre al formato."); return; }
    setSaving(true);
    setError(null);
    try {
      const concept = await createBankConcept({
        pipelineType, stage, format,
        name, description, execution,
        bank_tags: tags,
      });
      await onCreated?.(concept);
      onClose?.();
    } catch (e) {
      setError(e?.message || String(e));
      setSaving(false);
    }
  };

  const pipeLabel = pipelineType === "organic" ? "Contenido (orgánico)" : "Creativos (ads)";

  return (
    <div
      onMouseDown={(e) => { downOnBackdrop.current = e.target === e.currentTarget; }}
      onMouseUp={(e) => { if (downOnBackdrop.current && e.target === e.currentTarget) requestClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 10001,
        background: "rgba(0,0,0,0.82)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20, fontFamily: DS.font,
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: "min(640px, 95vw)", maxHeight: "92vh",
          background: DS.bgSide, border: `1px solid ${DS.textHint}`,
          borderRadius: 16, color: DS.textPrimary,
          display: "flex", flexDirection: "column", overflow: "hidden",
          boxShadow: "0 30px 90px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{
          padding: "18px 22px 14px", borderBottom: `1px solid ${DS.textHint}`,
          display: "flex", alignItems: "flex-start", gap: 12, flexShrink: 0,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: DS.textMuted, marginBottom: 5 }}>
              Nuevo formato · Banco de referencias · {pipeLabel}
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Agregar concepto</h3>
          </div>
          <button onClick={requestClose} style={{
            width: 30, height: 30, borderRadius: 8, border: DS.border,
            background: "transparent", color: DS.textSecondary, cursor: "pointer", fontSize: 16, flexShrink: 0,
          }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 22px 20px" }}>
          <Field label="Título del formato">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus
              placeholder="Ej: Comparativo antes/después" style={inputStyle} />
          </Field>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <Field label="Etapa (pipeline)" style={{ flex: 1, minWidth: 200 }}>
              <Segmented options={STAGES} value={stage} onChange={setStage} />
            </Field>
            <Field label="Tipo" style={{ flex: 1, minWidth: 160 }}>
              <Segmented options={FORMATS} value={format} onChange={setFormat} />
            </Field>
          </div>
          <Field label="Tags de nicho">
            <div style={{
              display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center",
              padding: "8px 10px", borderRadius: 8, border: DS.border, background: DS.bgCard, minHeight: 42,
            }}>
              {tags.map((t) => (
                <span key={t} style={chipStyle}>
                  {t}
                  <button onClick={() => removeTag(t)} style={chipXStyle}>×</button>
                </span>
              ))}
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={onTagKeyDown}
                onBlur={() => addTag(tagInput)}
                list="add-concept-tag-suggestions"
                placeholder={tags.length ? "Agregar…" : "Ej: Salud y bienestar, Mascotas…"}
                style={{ flex: 1, minWidth: 120, border: "none", background: "transparent", color: DS.textPrimary, fontSize: 13, fontFamily: DS.font, outline: "none" }}
              />
              <datalist id="add-concept-tag-suggestions">
                {tagSuggestions.map((t) => <option key={t} value={t} />)}
              </datalist>
            </div>
          </Field>
          <Field label="Descripción">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
              placeholder="Cómo es el formato, cuándo usarlo…"
              style={{ ...inputStyle, resize: "vertical", minHeight: 54, fontFamily: DS.font }} />
          </Field>
          <Field label="Ejecución">
            <textarea value={execution} onChange={(e) => setExecution(e.target.value)} rows={2}
              placeholder="Notas de producción, estructura, hooks…"
              style={{ ...inputStyle, resize: "vertical", minHeight: 54, fontFamily: DS.font }} />
          </Field>
          {error && <div style={{ color: "#E24B4A", fontSize: 12, marginTop: 6 }}>{error}</div>}
        </div>

        <div style={{
          padding: "12px 22px", borderTop: `1px solid ${DS.textHint}`,
          display: "flex", justifyContent: "flex-end", gap: 8, flexShrink: 0,
        }}>
          <button onClick={requestClose} disabled={saving} style={ghostBtn}>Cancelar</button>
          <button onClick={save} disabled={saving || !name.trim()}
            style={{ ...primaryBtn, opacity: saving || !name.trim() ? 0.55 : 1 }}>
            {saving ? "Creando…" : "Crear formato"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Segmented({ options, value, onChange }) {
  return (
    <div style={{ display: "inline-flex", padding: 3, borderRadius: 50, background: DS.bgCard, border: DS.border, gap: 2, flexWrap: "wrap" }}>
      {options.map((o) => {
        const active = value === o.key;
        const c = o.color || DS.textPrimary;
        return (
          <button key={o.key} onClick={() => onChange(o.key)}
            style={{
              padding: "6px 14px", borderRadius: 50, border: "none",
              background: active ? (o.color ? `${o.color}22` : DS.bgSide) : "transparent",
              color: active ? c : DS.textMuted,
              fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: DS.font,
            }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Field({ label, children, style }) {
  return (
    <div style={{ marginBottom: 14, ...style }}>
      <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: DS.textMuted, fontWeight: 700, marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "9px 12px", borderRadius: 8, border: DS.border,
  background: DS.bgCard, color: DS.textPrimary, fontSize: 13,
  fontFamily: "inherit", outline: "none", boxSizing: "border-box",
};
const chipStyle = {
  display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 50,
  fontSize: 11, fontWeight: 700, color: "#7BB6E6", background: "rgba(59,139,212,0.16)", border: "1px solid rgba(59,139,212,0.40)",
};
const chipXStyle = { border: "none", background: "transparent", color: "#7BB6E6", cursor: "pointer", fontSize: 13, lineHeight: 1, padding: 0 };
const primaryBtn = {
  padding: "9px 22px", borderRadius: 50, border: "none", background: "#1D9E75",
  color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: DS.font,
};
const ghostBtn = {
  padding: "9px 16px", borderRadius: 50, border: DS.border, background: "transparent",
  color: DS.textSecondary, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: DS.font,
};
