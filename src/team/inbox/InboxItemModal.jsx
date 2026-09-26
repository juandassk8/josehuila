import { useEffect, useMemo, useRef, useState } from "react";
import { DS, withAlpha } from "../../lib/design.js";
import { LabelEditor } from "../../despliegue/ReferenceLabelUI.jsx";
import { suggestionsByCategory } from "../../despliegue/labels.js";
import { uploadExampleImage } from "../../despliegue/storage.js";
import { listBankConcepts, BANK_REFS_COMPANY_ID, BANK_REFS_COMPANY_NAME } from "../concept_bank/db.js";
import { updateInboxItem, commitInboxItem } from "./inboxDb.js";

const STAGE_OPTS = [
  { key: "tofu", label: "TOFU", color: DS.blue },
  { key: "mofu", label: "MOFU", color: DS.amber },
  { key: "bofu", label: "BOFU", color: DS.green },
];
const MEDIA_OPTS = [
  { key: "video", label: "Video" },
  { key: "static", label: "Estático" },
];

// Detalle + edición de un item de la bandeja + "Cargar al banco".
// La MISMA UI sirve para Fase 1 (Jose llena los campos) y Fase 2 (la IA los
// pre-llena y Jose solo confirma).
export function InboxItemModal({ item, companies = [], canCommit = true, onClose, onSaved }) {
  const [format, setFormat] = useState(item.suggested_format || "");
  const [stage, setStage] = useState(item.suggested_stage || "tofu");
  const [mediaType, setMediaType] = useState(item.suggested_media_type || "video");
  const [name, setName] = useState(item.suggested_name || "");
  const [description, setDescription] = useState(item.suggested_description || "");
  const [labels, setLabels] = useState(item.suggested_labels || {});
  const [coverUrl, setCoverUrl] = useState(item.cover_url || "");
  const [videoBackupUrl, setVideoBackupUrl] = useState(item.video_backup_url || "");
  const [note, setNote] = useState(item.note || "");
  const [companyId, setCompanyId] = useState(item.company_id || "");

  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState(null);

  // Modo de commit — si el item ya trae un concepto destino pre-elegido en la
  // captura, arrancamos en "existente" con ese concepto seleccionado.
  const [commitMode, setCommitMode] = useState(item.target_concept_id ? "existing" : "new"); // new | existing
  const [bankConcepts, setBankConcepts] = useState(null);
  const [targetConceptId, setTargetConceptId] = useState(item.target_concept_id || "");
  const [conceptSearch, setConceptSearch] = useState("");

  const fileInputRef = useRef(null);
  const downOnBackdrop = useRef(false);
  const isImported = item.status === "imported";

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", handler);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", handler); document.body.style.overflow = prev; };
  }, [onClose]);

  // Carga perezosa de conceptos del banco cuando se elige "formato existente".
  useEffect(() => {
    if (commitMode === "existing" && bankConcepts === null) {
      listBankConcepts()
        .then((data) => setBankConcepts(data))
        .catch((e) => setError(e?.message || String(e)));
    }
  }, [commitMode, bankConcepts]);

  const existingOptions = useMemo(() => {
    if (!bankConcepts) return [];
    const term = conceptSearch.trim().toLowerCase();
    const list = bankConcepts
      .filter((c) => c.pipeline_type === (item.pipeline_type || "ads"))
      .filter((c) => {
        if (!term) return true; // sin texto → mostramos TODOS
        const hay = `${c.name || ""} ${c.company_name || ""}`.toLowerCase();
        return hay.includes(term);
      });
    // Empresa destino elegida primero, luego alfabético.
    list.sort((a, b) => {
      const aOwn = companyId && a.company_id === companyId ? 0 : 1;
      const bOwn = companyId && b.company_id === companyId ? 0 : 1;
      if (aOwn !== bOwn) return aOwn - bOwn;
      return (a.name || "").localeCompare(b.name || "");
    });
    return list.slice(0, 100);
  }, [bankConcepts, conceptSearch, companyId, item.pipeline_type]);

  const onPickFile = (f) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) { setError("El archivo debe ser una imagen."); return; }
    setError(null);
    setFile(f);
    setCoverUrl("");
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target.result);
    reader.readAsDataURL(f);
  };
  const clearImage = () => { setFile(null); setPreview(null); setCoverUrl(""); if (fileInputRef.current) fileInputRef.current.value = ""; };

  // Sube la portada si hay archivo y devuelve la URL final.
  const resolveCoverUrl = async () => {
    if (file) {
      setUploading(true);
      const url = await uploadExampleImage(file, { conceptId: "inbox" });
      setUploading(false);
      return url;
    }
    return coverUrl.trim() || null;
  };

  const buildPatch = (cover) => ({
    suggested_format: format.trim() || null,
    suggested_stage: stage,
    suggested_media_type: mediaType,
    suggested_name: name.trim() || null,
    suggested_description: description.trim() || null,
    suggested_labels: labels || {},
    cover_url: cover,
    video_backup_url: videoBackupUrl.trim() || null,
    note: note.trim() || null,
    company_id: companyId || null,
  });

  const save = async () => {
    setSaving(true); setError(null);
    try {
      const cover = await resolveCoverUrl();
      const updated = await updateInboxItem(item.id, buildPatch(cover));
      await onSaved?.(updated);
      onClose?.();
    } catch (e) {
      setUploading(false);
      setError(e?.message || String(e));
      setSaving(false);
    }
  };

  const commit = async () => {
    setCommitting(true); setError(null);
    try {
      const cover = await resolveCoverUrl();
      // Guardamos primero para que commitInboxItem lea los campos frescos.
      const patch = buildPatch(cover);
      await updateInboxItem(item.id, patch);
      const merged = { ...item, ...patch };
      await commitInboxItem(merged, { mode: commitMode, targetConceptId: targetConceptId || null });
      await onSaved?.();
      onClose?.();
    } catch (e) {
      setUploading(false);
      setError(e?.message || String(e));
      setCommitting(false);
    }
  };

  const busy = saving || committing || uploading;
  const suggestions = useMemo(() => suggestionsByCategory([]), []);

  return (
    <div
      onMouseDown={(e) => { downOnBackdrop.current = e.target === e.currentTarget; }}
      onMouseUp={(e) => { if (downOnBackdrop.current && e.target === e.currentTarget && !busy) onClose?.(); }}
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
          width: "min(720px, 96vw)", maxHeight: "94vh",
          background: DS.bgSide, border: `1px solid ${DS.textHint}`,
          borderRadius: 16, color: DS.textPrimary,
          display: "flex", flexDirection: "column", overflow: "hidden",
          boxShadow: "0 30px 90px rgba(0,0,0,0.6)",
        }}
      >
        {/* Header */}
        <div style={{ padding: "16px 22px 12px", borderBottom: `1px solid ${DS.textHint}`, display: "flex", alignItems: "flex-start", gap: 12, flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: DS.textMuted, marginBottom: 5 }}>
              Referente en revisión {item.source_kind === "ai" ? `· ✨ IA${typeof item.ai_confidence === "number" ? ` ${Math.round(item.ai_confidence * 100)}%` : ""}` : ""}
            </div>
            <a href={item.source_url} target="_blank" rel="noreferrer"
              style={{ fontSize: 13, color: DS.blue, textDecoration: "none", wordBreak: "break-all" }}>
              {item.source_url} ↗
            </a>
          </div>
          <button onClick={onClose} disabled={busy} style={{
            width: 30, height: 30, borderRadius: 8, border: DS.border,
            background: "transparent", color: DS.textSecondary, cursor: "pointer", fontSize: 16, flexShrink: 0,
          }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 22px 20px" }}>
          {isImported && (
            <div style={{ marginBottom: 14, padding: "8px 12px", borderRadius: 8, background: withAlpha(DS.green, "1a"), border: `1px solid ${withAlpha(DS.green, "55")}`, color: DS.green, fontSize: 12, fontWeight: 700 }}>
              ✓ Ya cargado al banco
            </div>
          )}

          {/* Portada */}
          <Field label="Portada (subir o pegar URL)">
            {preview || coverUrl ? (
              <div style={{ position: "relative", display: "inline-block" }}>
                <img src={preview || coverUrl} alt="" style={{ maxWidth: "100%", maxHeight: 200, borderRadius: 10, border: DS.border }} />
                <button onClick={clearImage} style={{
                  position: "absolute", top: 6, right: 6, width: 24, height: 24, borderRadius: 6,
                  border: "none", background: "rgba(0,0,0,0.7)", color: "#fff", cursor: "pointer", fontSize: 13,
                }}>×</button>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); onPickFile(e.dataTransfer.files?.[0]); }}
                style={{ padding: 18, borderRadius: 10, border: DS.borderDash || `1px dashed ${DS.textHint}`, background: DS.bgCard, textAlign: "center", cursor: "pointer", color: DS.textMuted, fontSize: 12 }}
              >
                Arrastrá una imagen o hacé clic para subir la portada
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => onPickFile(e.target.files?.[0])} />
            {!file && (
              <input value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} placeholder="…o pegá una URL de imagen (https://…)" style={{ ...inputStyle, marginTop: 8 }} />
            )}
          </Field>

          {/* Formato + Nombre/hook */}
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <Field label="Formato" style={{ flex: 1, minWidth: 220 }}>
              <input value={format} onChange={(e) => setFormat(e.target.value)} maxLength={80}
                placeholder="Ej: B-roll voz en off, Noticia, Founder…" style={inputStyle} />
            </Field>
            <Field label="Nombre / hook" style={{ flex: 1, minWidth: 220 }}>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120}
                placeholder="Ej: Campesino le pone nombre a su cosecha" style={inputStyle} />
            </Field>
          </div>

          {/* Stage + Media type */}
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            <Field label="Etapa del funnel" style={{ minWidth: 200 }}>
              <div style={{ display: "flex", gap: 6 }}>
                {STAGE_OPTS.map((s) => (
                  <Pill key={s.key} active={stage === s.key} color={s.color} onClick={() => setStage(s.key)}>{s.label}</Pill>
                ))}
              </div>
            </Field>
            <Field label="Tipo" style={{ minWidth: 160 }}>
              <div style={{ display: "flex", gap: 6 }}>
                {MEDIA_OPTS.map((m) => (
                  <Pill key={m.key} active={mediaType === m.key} color={DS.textSecondary} onClick={() => setMediaType(m.key)}>{m.label}</Pill>
                ))}
              </div>
            </Field>
          </div>

          <Field label="Descripción">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
              placeholder="Cómo se ejecuta el formato, qué muestra, cómo conecta con el producto…"
              style={{ ...inputStyle, resize: "vertical", minHeight: 60 }} />
          </Field>

          {item.transcript && item.transcript.trim() && (
            <Field label="Guion / transcripción del video">
              <div style={{ maxHeight: 200, overflowY: "auto", padding: "10px 12px", borderRadius: 8, background: DS.bgCard, border: DS.border, color: DS.textSecondary, fontSize: 12.5, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                {item.transcript}
              </div>
            </Field>
          )}

          <Field label="Link de respaldo (Drive)">
            <input value={videoBackupUrl} onChange={(e) => setVideoBackupUrl(e.target.value)}
              placeholder="https://drive.google.com/..." style={inputStyle} />
          </Field>

          <Field label="Etiquetas (marca · nicho · ángulo · formato)">
            <LabelEditor value={labels} onChange={setLabels} suggestions={suggestions} />
          </Field>

          <Field label="Nota">
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota interna…" style={inputStyle} />
          </Field>

          {/* ───── Cargar al banco ───── */}
          {canCommit && !isImported && (
            <div style={{ marginTop: 6, padding: 14, borderRadius: 12, border: `1px solid ${withAlpha(DS.green, "44")}`, background: withAlpha(DS.green, "0d") }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: DS.green, marginBottom: 10 }}>
                Cargar al banco
              </div>

              <Field label="Empresa destino">
                <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} style={inputStyle}>
                  <option value="">🏦 {BANK_REFS_COMPANY_NAME} (sin empresa)</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </Field>

              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <Pill active={commitMode === "new"} color={DS.green} onClick={() => setCommitMode("new")}>➕ Crear formato nuevo</Pill>
                <Pill active={commitMode === "existing"} color={DS.blue} onClick={() => setCommitMode("existing")}>📎 Agregar a formato existente</Pill>
              </div>

              {commitMode === "existing" && (
                <div style={{ marginBottom: 8 }}>
                  <input value={conceptSearch} onChange={(e) => setConceptSearch(e.target.value)}
                    placeholder="Buscar formato del banco…" style={{ ...inputStyle, marginBottom: 8 }} />
                  <div style={{ maxHeight: 190, overflowY: "auto", border: DS.border, borderRadius: 8, background: DS.bgCard }}>
                    {bankConcepts === null && <div style={{ padding: 14, color: DS.textMuted, fontSize: 12 }}>Cargando formatos…</div>}
                    {bankConcepts !== null && existingOptions.length === 0 && (
                      <div style={{ padding: 14, color: DS.textMuted, fontSize: 12 }}>
                        {conceptSearch ? "Ningún formato matchea." : "Elegí una empresa o buscá un formato."}
                      </div>
                    )}
                    {existingOptions.map((c) => (
                      <button key={c.id} onClick={() => setTargetConceptId(c.id)}
                        style={{
                          display: "flex", width: "100%", textAlign: "left", gap: 8, alignItems: "center",
                          padding: "8px 12px", border: "none", cursor: "pointer", fontFamily: DS.font,
                          background: targetConceptId === c.id ? withAlpha(DS.blue, "22") : "transparent",
                          color: DS.textPrimary, fontSize: 12,
                          borderBottom: `1px solid ${withAlpha(DS.textHint, "40")}`,
                        }}>
                        <span style={{ fontSize: 9, fontWeight: 800, color: DS.textMuted, textTransform: "uppercase" }}>{c.stage}</span>
                        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                        <span style={{ fontSize: 10, color: DS.textMuted }}>{c.company_name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {error && <div style={{ color: "#E24B4A", fontSize: 12, marginTop: 10 }}>{error}</div>}
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 22px", borderTop: `1px solid ${DS.textHint}`, display: "flex", justifyContent: "flex-end", gap: 8, flexShrink: 0 }}>
          <button onClick={onClose} disabled={busy} style={ghostBtn}>Cerrar</button>
          <button onClick={save} disabled={busy} style={{ ...ghostBtn, borderColor: DS.blue, color: DS.blue }}>
            {uploading && !committing ? "Subiendo…" : saving ? "Guardando…" : "Guardar cambios"}
          </button>
          {canCommit && !isImported && (
            <button
              onClick={commit}
              disabled={busy || (commitMode === "existing" && !targetConceptId)}
              style={{ ...primaryBtn, opacity: busy || (commitMode === "existing" && !targetConceptId) ? 0.55 : 1 }}>
              {committing ? "Cargando…" : "Cargar al banco →"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Pill({ children, active, color, onClick }) {
  const c = color || DS.textSecondary;
  return (
    <button onClick={onClick} style={{
      padding: "6px 12px", borderRadius: 50, cursor: "pointer", fontFamily: DS.font,
      fontSize: 11, fontWeight: 700,
      border: active ? `1.5px solid ${c}` : DS.border,
      background: active ? withAlpha(c, "22") : "transparent",
      color: active ? c : DS.textMuted,
    }}>{children}</button>
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
