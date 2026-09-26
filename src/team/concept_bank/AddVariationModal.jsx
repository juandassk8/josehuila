import { useEffect, useRef, useState } from "react";
import { DS } from "../../lib/design.js";
import { STATES } from "../../despliegue/constants.js";
import { uploadExampleImage } from "../../despliegue/storage.js";
import { LabelEditor } from "../../despliegue/ReferenceLabelUI.jsx";
import { classifyReference } from "../../lib/classifyRef.js";
import { createBankVariation, fetchLabelVocabulary } from "./db.js";

// Modal para agregar una referencia (variation) a un concepto del banco.
// Permite subir una imagen (o pegar una URL) + link de Drive + link de Meta.
export function AddVariationModal({ conceptId, conceptName, isBankRef = true, companyName, onClose, onCreated }) {
  const [label, setLabel] = useState("");
  const [name, setName] = useState("");
  const [state, setState] = useState("produced");
  const [driveUrl, setDriveUrl] = useState("");
  const [metaUrl, setMetaUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [labels, setLabels] = useState({});
  const [vocab, setVocab] = useState({});
  const [notes, setNotes] = useState("");
  const [transcript, setTranscript] = useState("");
  const [showTranscript, setShowTranscript] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeMsg, setAnalyzeMsg] = useState(null);
  const downOnBackdrop = useRef(false);
  const fileInputRef = useRef(null);

  // Vocabulario global de etiquetas (para autocompletar y mantener todo conectado).
  useEffect(() => { fetchLabelVocabulary().then(setVocab).catch(() => {}); }, []);

  const hasLabels = Object.values(labels).some((a) => Array.isArray(a) && a.length);
  const isDirty = !!(label || name || driveUrl || metaUrl || imageUrl || file || hasLabels || notes || transcript);

  // Analiza con IA desde el link de Drive / Meta / imagen y llena etiquetas +
  // nombre + notas (cómo está hecho) + guion. Jose revisa y ajusta antes de guardar.
  // OJO: NO llena "formato" — esta referencia ya vive DENTRO de un concepto que ES
  // el formato (ej: "Celebridad"), así que la etiqueta de formato sería redundante.
  const handleAnalyze = async () => {
    setAnalyzing(true); setError(null); setAnalyzeMsg("Analizando…");
    try {
      const r = await classifyReference({
        driveUrl, metaUrl, imageUrl, file, conceptId,
        knownLabels: vocab, onProgress: setAnalyzeMsg,
      });
      if (r.suggested_labels && Object.keys(r.suggested_labels).length) {
        const { formato, ...rest } = r.suggested_labels;   // omitimos formato
        setLabels(rest);
      }
      if (!name && r.suggested_name) setName(r.suggested_name);
      if (!notes && r.suggested_description) setNotes(r.suggested_description);
      if (r.transcript && r.transcript.trim()) { setTranscript(r.transcript.trim()); setShowTranscript(true); }
      if (!file && !imageUrl && r.cover_url) setImageUrl(r.cover_url);
      if (!driveUrl && r.drive_url) setDriveUrl(r.drive_url);
      setAnalyzeMsg("✓ Analizado. Revisá y guardá.");
    } catch (e) {
      setError(e?.message || String(e)); setAnalyzeMsg(null);
    } finally { setAnalyzing(false); }
  };
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

  const onPickFile = (f) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) { setError("El archivo debe ser una imagen."); return; }
    setError(null);
    setFile(f);
    setImageUrl(""); // el archivo tiene prioridad sobre la URL pegada
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target.result);
    reader.readAsDataURL(f);
  };

  const clearImage = () => { setFile(null); setPreview(null); if (fileInputRef.current) fileInputRef.current.value = ""; };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      let file_url = imageUrl.trim() || null;
      if (file) {
        setUploading(true);
        file_url = await uploadExampleImage(file, { conceptId });
        setUploading(false);
      }
      await createBankVariation({
        conceptId,
        label: label.trim() || "Ref",
        name, state,
        file_url,
        drive_url: driveUrl,
        meta_ads_library_url: metaUrl,
        bank_labels: labels,
        notes,
        transcript,
      });
      await onCreated?.();
      onClose?.();
    } catch (e) {
      setUploading(false);
      setError(e?.message || String(e));
      setSaving(false);
    }
  };

  return (
    <div
      onMouseDown={(e) => { downOnBackdrop.current = e.target === e.currentTarget; }}
      onMouseUp={(e) => { if (downOnBackdrop.current && e.target === e.currentTarget) requestClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 10002,
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
              Nueva referencia · {conceptName || "Concepto"}
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Agregar referencia</h3>
            {!isBankRef && companyName && (
              <div style={{ fontSize: 11, color: "#E2A24B", marginTop: 5 }}>
                ⚠ Se agrega también al despliegue de {companyName}
              </div>
            )}
          </div>
          <button onClick={requestClose} style={{
            width: 30, height: 30, borderRadius: 8, border: DS.border,
            background: "transparent", color: DS.textSecondary, cursor: "pointer", fontSize: 16, flexShrink: 0,
          }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 22px 20px" }}>
          {/* Imagen */}
          <Field label="Imagen (subir o pegar URL)">
            {preview || imageUrl ? (
              <div style={{ position: "relative", display: "inline-block" }}>
                <img src={preview || imageUrl} alt="" style={{ maxWidth: "100%", maxHeight: 220, borderRadius: 10, border: DS.border }} />
                <button onClick={() => { clearImage(); setImageUrl(""); }} style={{
                  position: "absolute", top: 6, right: 6, width: 24, height: 24, borderRadius: 6,
                  border: "none", background: "rgba(0,0,0,0.7)", color: "#fff", cursor: "pointer", fontSize: 13,
                }}>×</button>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); onPickFile(e.dataTransfer.files?.[0]); }}
                style={{
                  padding: 20, borderRadius: 10, border: DS.borderDash || `1px dashed ${DS.textHint}`,
                  background: DS.bgCard, textAlign: "center", cursor: "pointer",
                  color: DS.textMuted, fontSize: 12,
                }}
              >
                Arrastrá una imagen o hacé clic para subir
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }}
              onChange={(e) => onPickFile(e.target.files?.[0])} />
            {!file && (
              <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)}
                placeholder="…o pegá una URL de imagen (https://…)"
                style={{ ...inputStyle, marginTop: 8 }} />
            )}
          </Field>

          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <Field label="Etiqueta corta" style={{ width: 140 }}>
              <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={30}
                placeholder="Ej: A, Ref 1" style={inputStyle} />
            </Field>
            <Field label="Nombre / hook" style={{ flex: 1, minWidth: 200 }}>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80}
                placeholder="Ej: Mamá mostrando antes/después" style={inputStyle} />
            </Field>
          </div>

          <Field label="Link Biblioteca de Anuncios Meta">
            <input value={metaUrl} onChange={(e) => setMetaUrl(e.target.value)}
              placeholder="https://facebook.com/ads/library/..." style={inputStyle} />
          </Field>
          <Field label="Link de respaldo (Drive)">
            <input value={driveUrl} onChange={(e) => setDriveUrl(e.target.value)}
              placeholder="https://drive.google.com/..." style={inputStyle} />
          </Field>

          {/* Analizar con IA: saca portada + marca/nicho/ángulo/formato del Drive/Meta/imagen */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            <button onClick={handleAnalyze} disabled={analyzing || (!driveUrl && !metaUrl && !imageUrl && !file)}
              style={{
                padding: "8px 16px", borderRadius: 50, border: `1px solid ${DS.purple}`,
                background: `${DS.purple}18`, color: DS.purple, fontSize: 12, fontWeight: 800,
                cursor: analyzing || (!driveUrl && !metaUrl && !imageUrl && !file) ? "not-allowed" : "pointer",
                fontFamily: DS.font, opacity: analyzing || (!driveUrl && !metaUrl && !imageUrl && !file) ? 0.5 : 1,
              }}>
              {analyzing ? "✨ Analizando…" : "✨ Analizar con IA"}
            </button>
            {analyzeMsg && <span style={{ fontSize: 11, color: analyzing ? DS.purple : DS.textMuted }}>{analyzeMsg}</span>}
            {!analyzeMsg && !analyzing && (
              <span style={{ fontSize: 11, color: DS.textMuted }}>Saca portada + marca/nicho/ángulo/formato del Drive, Meta o la imagen.</span>
            )}
          </div>

          <Field label="Etiquetas (marca · nicho · ángulo)">
            <LabelEditor value={labels} onChange={setLabels} suggestions={vocab} />
          </Field>

          <Field label="Notas · cómo está hecho el video">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
              placeholder="Contexto de ejecución (gancho, tomas, estructura…). Se llena solo al analizar."
              style={{ ...inputStyle, resize: "vertical", minHeight: 64 }} />
          </Field>

          {transcript && (
            <Field label="Guion / transcripción del video">
              <button onClick={() => setShowTranscript((s) => !s)} style={{
                ...inputStyle, textAlign: "left", cursor: "pointer", color: DS.textSecondary,
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <span>{showTranscript ? "▾ Ocultar guion" : "▸ Ver guion transcrito"}</span>
                <span style={{ fontSize: 10, color: DS.textMuted }}>{transcript.length} car.</span>
              </button>
              {showTranscript && (
                <textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={6}
                  style={{ ...inputStyle, marginTop: 6, resize: "vertical", minHeight: 100, lineHeight: 1.5 }} />
              )}
            </Field>
          )}

          <Field label="Estado">
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {STATES.map((s) => {
                const active = state === s.key;
                const c = s.color === "transparent" ? "#3A3F3C" : s.color;
                return (
                  <button key={s.key} onClick={() => setState(s.key)}
                    style={{
                      padding: "6px 12px", borderRadius: 50,
                      border: active ? `1.5px solid ${c}` : DS.border,
                      background: active && s.color !== "transparent" ? `${s.color}22` : "transparent",
                      color: active ? (s.color === "transparent" ? DS.textSecondary : s.color) : DS.textMuted,
                      fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: DS.font,
                    }}>
                    {s.label}
                  </button>
                );
              })}
            </div>
          </Field>
          {error && <div style={{ color: "#E24B4A", fontSize: 12, marginTop: 6 }}>{error}</div>}
        </div>

        <div style={{
          padding: "12px 22px", borderTop: `1px solid ${DS.textHint}`,
          display: "flex", justifyContent: "flex-end", gap: 8, flexShrink: 0,
        }}>
          <button onClick={requestClose} disabled={saving} style={ghostBtn}>Cancelar</button>
          <button onClick={save} disabled={saving}
            style={{ ...primaryBtn, opacity: saving ? 0.55 : 1 }}>
            {uploading ? "Subiendo imagen…" : saving ? "Guardando…" : "Agregar referencia"}
          </button>
        </div>
      </div>
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
