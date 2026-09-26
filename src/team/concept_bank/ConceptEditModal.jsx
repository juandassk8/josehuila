import { useEffect, useMemo, useRef, useState } from "react";
import { DS } from "../../lib/design.js";
import { updateBankConcept, excludeConceptsFromBank, deleteConceptCompletely, moveConceptToPipeline } from "./db.js";
import { synthesizeFormat } from "../../lib/classifyRef.js";
import { getLabels } from "../../despliegue/labels.js";

const STAGES = [
  { key: "tofu", label: "TOFU", color: DS.blue },
  { key: "mofu", label: "MOFU", color: DS.amber },
  { key: "bofu", label: "BOFU", color: DS.green },
];
const FORMATS = [
  { key: "static", label: "Estático" },
  { key: "video", label: "Video" },
];
const PIPELINES = [
  { key: "ads", label: "🎬 Creativos" },
  { key: "organic", label: "🌱 Contenido" },
];

// Normaliza un tag: trim + colapsa espacios. No fuerza mayúsculas para respetar
// lo que el user escriba (ej. "Salud y bienestar").
const normTag = (t) => (t || "").trim().replace(/\s+/g, " ");

// Modal para editar un formato del banco: título, descripción, ejecución, tipo
// (estático/video), stage (TOFU/MOFU/BOFU) y tags de nicho. Sólo Admin lo abre.
// Incluye zona de peligro con dos acciones: ocultar del banco (reversible) y
// eliminar definitivamente (borra concepto + refs, también del despliegue origen).
export function ConceptEditModal({ item, existingTags = [], variations = [], onClose, onSaved, onDeleted }) {
  const [name, setName] = useState(item?.name || "");
  const [description, setDescription] = useState(item?.description || "");
  const [execution, setExecution] = useState(item?.execution || "");
  const [format, setFormat] = useState(item?.format || "static");
  const [stage, setStage] = useState(item?.stage || "tofu");
  const [pipeline, setPipeline] = useState(item?.pipeline_type || "ads");
  const [tags, setTags] = useState(() => (item?.bank_tags || []).map(normTag).filter(Boolean));
  const [tagInput, setTagInput] = useState("");

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);
  const [confirmMode, setConfirmMode] = useState(null); // null | 'menu'
  const [synthesizing, setSynthesizing] = useState(false);
  const [synthMsg, setSynthMsg] = useState(null);
  const downOnBackdrop = useRef(false);

  // Rellena Descripción + Ejecución con IA a partir de las referencias analizadas
  // del concepto (guion + cómo está hecho + etiquetas). Jose revisa antes de guardar.
  const refsWithContent = (variations || []).filter((v) => (v.transcript && v.transcript.trim()) || (v.notes && v.notes.trim()));
  const handleSynthesize = async () => {
    setSynthesizing(true); setError(null); setSynthMsg("Leyendo las referencias…");
    try {
      const references = refsWithContent.map((v) => ({
        name: v.name || v.label || "", transcript: v.transcript || "", notes: v.notes || "", labels: getLabels(v),
      }));
      const { description: d, execution: ex } = await synthesizeFormat(references, { formatName: name });
      if (d) setDescription(d);
      if (ex) setExecution(ex);
      setSynthMsg("✓ Rellenado con IA. Revisá y guardá.");
    } catch (e) {
      setError(`No se pudo rellenar con IA: ${e?.message || e}`); setSynthMsg(null);
    } finally { setSynthesizing(false); }
  };

  const initial = useMemo(
    () => JSON.stringify({
      name: item?.name || "",
      description: item?.description || "",
      execution: item?.execution || "",
      format: item?.format || "static",
      stage: item?.stage || "tofu",
      pipeline: item?.pipeline_type || "ads",
      tags: (item?.bank_tags || []).map(normTag).filter(Boolean),
    }),
    [item]
  );
  const current = JSON.stringify({ name, description, execution, format, stage, pipeline, tags });
  const isDirty = current !== initial;

  const requestClose = () => {
    if (isDirty && !confirm("Tenés cambios sin guardar. ¿Salir igual?")) return;
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
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(tagInput);
    } else if (e.key === "Backspace" && !tagInput && tags.length) {
      removeTag(tags[tags.length - 1]);
    }
  };

  const save = async () => {
    if (!name.trim()) { setError("El nombre no puede quedar vacío."); return; }
    setSaving(true);
    setError(null);
    try {
      await updateBankConcept(item.id, {
        name: name.trim(),
        description: description.trim() || null,
        execution: execution.trim() || null,
        format,
        stage,
        bank_tags: tags,
      });
      // Si cambió de banco (ads ↔ organic), reubicar el concepto al board del
      // pipeline destino. Es un cambio de board_id (no un simple campo).
      if (pipeline !== (item?.pipeline_type || "ads")) {
        await moveConceptToPipeline(item.id, pipeline);
      }
      await onSaved?.();
      onClose?.();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleHide = async () => {
    setDeleting(true);
    setError(null);
    try {
      await excludeConceptsFromBank([item.id]);
      await onDeleted?.();
      onClose?.();
    } catch (e) {
      setError(e?.message || String(e));
      setDeleting(false);
    }
  };

  const handleDeleteForever = async () => {
    if (!confirm(
      `¿Eliminar DEFINITIVAMENTE "${item.name || "este formato"}"?\n\n` +
      `Se borra el concepto y todas sus referencias, también del despliegue de ${item.company_name}. ` +
      `Esta acción no se puede deshacer.`
    )) return;
    setDeleting(true);
    setError(null);
    try {
      const { count } = await deleteConceptCompletely(item.id);
      if (count === 0) {
        setError("No se borró ningún formato (0 filas). Puede ser un tema de permisos en la base.");
        setDeleting(false);
        return;
      }
      await onDeleted?.();
      onClose?.();
    } catch (e) {
      setError(e?.message || String(e));
      setDeleting(false);
    }
  };

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
          width: "min(680px, 95vw)", maxHeight: "92vh",
          background: DS.bgSide, border: `1px solid ${DS.textHint}`,
          borderRadius: 16, color: DS.textPrimary,
          display: "flex", flexDirection: "column", overflow: "hidden",
          boxShadow: "0 30px 90px rgba(0,0,0,0.6)",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "18px 22px 14px", borderBottom: `1px solid ${DS.textHint}`,
          display: "flex", alignItems: "flex-start", gap: 12, flexShrink: 0,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: DS.textMuted, marginBottom: 5 }}>
              Editar formato · {item?.company_name}
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{item?.name || "Sin nombre"}</h3>
          </div>
          <button
            onClick={requestClose}
            style={{
              width: 30, height: 30, borderRadius: 8, border: DS.border,
              background: "transparent", color: DS.textSecondary, cursor: "pointer",
              fontSize: 16, flexShrink: 0,
            }}
          >×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 22px 20px" }}>
          <Field label="Título del formato">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120}
              placeholder="Ej: Comparativo antes/después" style={inputStyle} />
          </Field>

          <Field label="Banco">
            <Segmented options={PIPELINES} value={pipeline} onChange={setPipeline} />
            {pipeline !== (item?.pipeline_type || "ads") && (
              <div style={{ fontSize: 10, color: "#E2A24B", marginTop: 5 }}>
                ⚠ Se moverá de {(item?.pipeline_type || "ads") === "ads" ? "Creativos" : "Contenido"} a {pipeline === "ads" ? "Creativos" : "Contenido"}
                {item?.company_name && item.company_name !== "Banco de referencias" ? ` (también en el despliegue de ${item.company_name})` : ""}
              </div>
            )}
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
              padding: "8px 10px", borderRadius: 8, border: DS.border,
              background: DS.bgCard, minHeight: 42,
            }}>
              {tags.map((t) => (
                <span key={t} style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "3px 8px", borderRadius: 50, fontSize: 11, fontWeight: 700,
                  color: "#7BB6E6", background: "rgba(59,139,212,0.16)",
                  border: "1px solid rgba(59,139,212,0.40)",
                }}>
                  {t}
                  <button onClick={() => removeTag(t)} style={{
                    border: "none", background: "transparent", color: "#7BB6E6",
                    cursor: "pointer", fontSize: 13, lineHeight: 1, padding: 0,
                  }}>×</button>
                </span>
              ))}
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={onTagKeyDown}
                onBlur={() => addTag(tagInput)}
                list="concept-tag-suggestions"
                placeholder={tags.length ? "Agregar…" : "Ej: Salud y bienestar, Mascotas…"}
                style={{
                  flex: 1, minWidth: 120, border: "none", background: "transparent",
                  color: DS.textPrimary, fontSize: 13, fontFamily: DS.font, outline: "none",
                }}
              />
              <datalist id="concept-tag-suggestions">
                {tagSuggestions.map((t) => <option key={t} value={t} />)}
              </datalist>
            </div>
            <div style={{ fontSize: 10, color: DS.textMuted, marginTop: 5 }}>
              Enter o coma para agregar. Los tags son independientes de la empresa.
            </div>
          </Field>

          {/* Rellenar Descripción + Ejecución con IA desde las referencias del concepto */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            <button onClick={handleSynthesize} disabled={synthesizing || refsWithContent.length === 0}
              title={refsWithContent.length === 0 ? "Analizá primero las referencias del concepto (necesitan guion/notas)" : "Genera descripción + ejecución con IA desde las referencias"}
              style={{
                padding: "8px 16px", borderRadius: 50, border: `1px solid ${DS.purple}`,
                background: `${DS.purple}18`, color: DS.purple, fontSize: 12, fontWeight: 800,
                cursor: synthesizing || refsWithContent.length === 0 ? "not-allowed" : "pointer",
                fontFamily: DS.font, opacity: synthesizing || refsWithContent.length === 0 ? 0.5 : 1,
              }}>
              {synthesizing ? "✨ Rellenando…" : "✨ Rellenar con IA"}
            </button>
            <span style={{ fontSize: 11, color: synthesizing ? DS.purple : DS.textMuted }}>
              {synthMsg || (refsWithContent.length ? `Desde ${refsWithContent.length} referencia(s) analizada(s)` : "Analizá primero las referencias (necesitan guion)")}
            </span>
          </div>

          <Field label="Descripción · cómo funciona el formato">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
              placeholder="Cómo es el formato, cuándo usarlo…"
              style={{ ...inputStyle, resize: "vertical", minHeight: 64, fontFamily: DS.font }} />
          </Field>

          <Field label="Ejecución">
            <textarea value={execution} onChange={(e) => setExecution(e.target.value)} rows={3}
              placeholder="Notas de producción, estructura, hooks…"
              style={{ ...inputStyle, resize: "vertical", minHeight: 64, fontFamily: DS.font }} />
          </Field>

          {/* Zona de peligro */}
          <div style={{
            marginTop: 18, paddingTop: 16, borderTop: `1px solid ${DS.textHint}`,
          }}>
            {!confirmMode ? (
              <button onClick={() => setConfirmMode("menu")} disabled={deleting} style={dangerGhostBtn}>
                🗑 Eliminar este formato…
              </button>
            ) : (
              <div style={{
                display: "flex", flexDirection: "column", gap: 8,
                padding: 12, borderRadius: 10,
                border: `1px solid ${DS.red}44`, background: `${DS.red}0D`,
              }}>
                <div style={{ fontSize: 12, color: DS.textSecondary }}>
                  ¿Cómo querés eliminarlo?
                </div>
                <button onClick={handleHide} disabled={deleting} style={hideBtn}>
                  Ocultar del banco
                  <span style={{ display: "block", fontSize: 10, fontWeight: 500, color: DS.textMuted, marginTop: 2 }}>
                    Reversible · no toca el despliegue de {item?.company_name}
                  </span>
                </button>
                <button onClick={handleDeleteForever} disabled={deleting} style={deleteBtn}>
                  Eliminar definitivamente
                  <span style={{ display: "block", fontSize: 10, fontWeight: 500, color: "rgba(255,255,255,0.75)", marginTop: 2 }}>
                    Borra concepto + refs, también del despliegue. Sin vuelta atrás.
                  </span>
                </button>
                <button onClick={() => setConfirmMode(null)} disabled={deleting} style={ghostBtn}>
                  Cancelar
                </button>
              </div>
            )}
          </div>

          {error && <div style={{ color: "#E24B4A", fontSize: 12, marginTop: 12 }}>{error}</div>}
        </div>

        {/* Footer */}
        <div style={{
          padding: "12px 22px", borderTop: `1px solid ${DS.textHint}`,
          display: "flex", justifyContent: "flex-end", gap: 8, flexShrink: 0,
        }}>
          <button onClick={requestClose} disabled={saving} style={ghostBtn}>Cerrar</button>
          <button onClick={save} disabled={saving || !isDirty}
            style={{ ...primaryBtn, opacity: saving || !isDirty ? 0.55 : 1 }}>
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Segmented({ options, value, onChange }) {
  return (
    <div style={{
      display: "inline-flex", padding: 3, borderRadius: 50,
      background: DS.bgCard, border: DS.border, gap: 2, flexWrap: "wrap",
    }}>
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
              letterSpacing: "0.02em",
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
const primaryBtn = {
  padding: "9px 22px", borderRadius: 50, border: "none", background: "#1D9E75",
  color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: DS.font,
};
const ghostBtn = {
  padding: "9px 16px", borderRadius: 50, border: DS.border, background: "transparent",
  color: DS.textSecondary, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: DS.font,
};
const dangerGhostBtn = {
  padding: "9px 16px", borderRadius: 50, border: `1px solid ${DS.red}55`, background: "transparent",
  color: DS.red, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: DS.font,
};
const hideBtn = {
  padding: "10px 14px", borderRadius: 10, border: DS.border, background: "transparent",
  color: DS.textPrimary, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: DS.font,
  textAlign: "left",
};
const deleteBtn = {
  padding: "10px 14px", borderRadius: 10, border: "none", background: DS.red,
  color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: DS.font,
  textAlign: "left",
};
