import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DS } from "../../lib/design.js";
import { STATES, STATE_COLOR, STATE_LABEL } from "../../despliegue/constants.js";
import { updateVariation } from "../../despliegue/db.js";
import { propagateCoverFrom } from "../../despliegue/db.js";
import { LabelEditor, LabelChips } from "../../despliegue/ReferenceLabelUI.jsx";
import { getLabels, hasAnyLabel } from "../../despliegue/labels.js";
import { drivePreviewUrl, isDriveLink } from "../../lib/driveLinks.js";
import { uploadVideoBlob, uploadCoverBlob } from "../../despliegue/storage.js";

// Badges de completitud de links. Verde ✓ si tiene, rojo ✗ si le falta.
// Se usa tanto en las cards del grid como en el header del detalle.
export function LinkBadges({ hasMeta, hasDrive, size = "md" }) {
  const compact = size === "sm";
  const pad = compact ? "1px 5px" : "3px 8px";
  const fs = compact ? 8 : 10;
  const badge = (ok, label) => (
    <span
      title={ok ? `${label}: presente` : `${label}: falta`}
      style={{
        display: "inline-flex", alignItems: "center", gap: 3,
        padding: pad, borderRadius: 50, fontSize: fs, fontWeight: 700,
        letterSpacing: "0.02em",
        color: ok ? "#1D9E75" : "#E2705B",
        background: ok ? "rgba(29,158,117,0.14)" : "rgba(226,112,91,0.12)",
        border: `1px solid ${ok ? "rgba(29,158,117,0.4)" : "rgba(226,112,91,0.35)"}`,
      }}
    >
      {ok ? "✓" : "✗"} {label}
    </span>
  );
  return (
    <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
      {badge(hasMeta, "Meta")}
      {badge(hasDrive, "Drive")}
    </span>
  );
}

// Modal de detalle de una referencia del banco: imagen grande + toda su info.
// Si `canEdit` (admin + ref propia), los campos de link/nombre/estado/notas son
// editables y se guardan con updateVariation. Si no, es solo lectura.
export function BankVariationDetailModal({ variation, conceptName, canEdit = false, isOwnRef = true, suggestions = {}, onClose, onSaved }) {
  const [name, setName] = useState(variation?.name || "");
  const [state, setState] = useState(variation?.state || "produced");
  const [driveUrl, setDriveUrl] = useState(variation?.drive_url || "");
  const [fileUrl, setFileUrl] = useState(variation?.file_url || "");
  const [metaUrl, setMetaUrl] = useState(variation?.meta_ads_library_url || "");
  const [notes, setNotes] = useState(variation?.notes || "");
  const [transcript, setTranscript] = useState(variation?.transcript || "");
  const [labels, setLabels] = useState(() => getLabels(variation));
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const videoInputRef = useRef(null);
  const coverInputRef = useRef(null);
  const downOnBackdrop = useRef(false);

  const initial = useMemo(
    () => JSON.stringify({
      name: variation?.name || "",
      state: variation?.state || "produced",
      drive_url: variation?.drive_url || "",
      file_url: variation?.file_url || "",
      meta_ads_library_url: variation?.meta_ads_library_url || "",
      notes: variation?.notes || "",
      transcript: variation?.transcript || "",
      labels: getLabels(variation),
    }),
    [variation]
  );
  const current = JSON.stringify({
    name, state, drive_url: driveUrl, file_url: fileUrl, meta_ads_library_url: metaUrl, notes, transcript, labels,
  });
  const isDirty = editing && current !== initial;

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

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateVariation(variation.id, {
        name: name.trim() || null,
        state,
        drive_url: driveUrl.trim() || null,
        file_url: fileUrl.trim() || null,
        meta_ads_library_url: metaUrl.trim() || null,
        notes: notes.trim() || null,
        transcript: transcript.trim() || null,
        bank_labels: labels,
      });
      // La portada arreglada acá tiene que verse también en el banco de cada
      // cliente que tenga este mismo anuncio importado.
      if (fileUrl.trim() && fileUrl.trim() !== (variation.file_url || "")) {
        await propagateCoverFrom({ ...variation, file_url: fileUrl.trim() }).catch(() => {});
      }
      setEditing(false);
      await onSaved?.();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setName(variation?.name || "");
    setState(variation?.state || "produced");
    setDriveUrl(variation?.drive_url || "");
    setFileUrl(variation?.file_url || "");
    setMetaUrl(variation?.meta_ads_library_url || "");
    setNotes(variation?.notes || "");
    setTranscript(variation?.transcript || "");
    setLabels(getLabels(variation));
    setEditing(false);
    setError(null);
  };

  // Fallback manual: subir el VIDEO como archivo (para creativos que no se
  // pudieron recuperar solos). Sube a Supabase (URL permanente) y lo deja en
  // drive_url → el reproductor funciona ya y Save lo persiste.
  const handleVideoUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingVideo(true);
    setError(null);
    try {
      const url = await uploadVideoBlob(file);
      setDriveUrl(url);
      setPlaying(false);
    } catch (err) {
      alert("No se pudo subir el video: " + (err?.message || String(err)));
    } finally {
      setUploadingVideo(false);
    }
  };

  // Fallback manual: subir la PORTADA como archivo de imagen. Sube a Supabase
  // (URL permanente) y la deja en file_url → el <img> se actualiza y Save la persiste.
  const uploadCoverFile = useCallback(async (file) => {
    if (!file) return;
    if (!file.type?.startsWith("image/")) {
      alert("Eso no es una imagen. Arrastrá un archivo de imagen (JPG/PNG).");
      return;
    }
    setUploadingCover(true);
    setError(null);
    try {
      const url = await uploadCoverBlob(file, { prefix: "bank-covers" });
      setFileUrl(url);
    } catch (err) {
      alert("No se pudo subir la portada: " + (err?.message || String(err)));
    } finally {
      setUploadingCover(false);
    }
  }, []);
  const handleCoverUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    await uploadCoverFile(file);
  };
  // Pegar una captura (Cmd/Ctrl+V) → sube directo como portada. Solo en edición y
  // si el foco NO está en un campo de texto (para no pisar el paste normal).
  useEffect(() => {
    if (!(canEdit && editing)) return;
    const onPaste = (e) => {
      const ae = document.activeElement;
      if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable)) return;
      for (const it of e.clipboardData?.items || []) {
        if (it.kind === "file" && it.type.startsWith("image/")) {
          const f = it.getAsFile();
          if (f) { e.preventDefault(); uploadCoverFile(f); return; }
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [canEdit, editing, uploadCoverFile]);

  // Drag & drop de la portada: soltar una imagen sobre el recuadro la sube directo.
  const [coverDragActive, setCoverDragActive] = useState(false);
  const [coverBtnDrag, setCoverBtnDrag] = useState(false);   // arrastre sobre el botón "Subir portada"
  const coverDnD = (canEdit && editing && !playing) ? {
    onDragOver: (e) => { e.preventDefault(); e.stopPropagation(); if (!coverDragActive) setCoverDragActive(true); },
    onDragEnter: (e) => { e.preventDefault(); e.stopPropagation(); setCoverDragActive(true); },
    onDragLeave: (e) => {
      e.preventDefault(); e.stopPropagation();
      // Solo apagar si el cursor sale del contenedor (no al pasar sobre hijos).
      if (!e.currentTarget.contains(e.relatedTarget)) setCoverDragActive(false);
    },
    onDrop: (e) => {
      e.preventDefault(); e.stopPropagation();
      setCoverDragActive(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) uploadCoverFile(file);
    },
  } : {};

  const hasMeta = !!metaUrl.trim();
  const hasDrive = !!driveUrl.trim();
  const drivePreview = drivePreviewUrl(driveUrl);   // URL /preview para el <iframe>, o null
  // Respaldo directo (Supabase/.mp4, no-Drive) → se reproduce con <video>.
  const directVideo = driveUrl.trim() && !isDriveLink(driveUrl) ? driveUrl.trim() : null;
  const canPlay = !!(drivePreview || directVideo);
  const stColor = STATE_COLOR[state] === "transparent" ? DS.textSecondary : STATE_COLOR[state];

  return (
    <div
      onMouseDown={(e) => { downOnBackdrop.current = e.target === e.currentTarget; }}
      onMouseUp={(e) => { if (downOnBackdrop.current && e.target === e.currentTarget) requestClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 10000,
        background: "rgba(0,0,0,0.82)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20, fontFamily: DS.font,
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: "min(960px, 95vw)", maxHeight: "92vh",
          background: DS.bgSide, border: `1px solid ${DS.textHint}`,
          borderRadius: 16, color: DS.textPrimary,
          display: "flex", overflow: "hidden",
          boxShadow: "0 30px 90px rgba(0,0,0,0.6)",
        }}
      >
        {/* Creativo: portada + reproductor de Drive inline */}
        <div
          {...coverDnD}
          style={{
            width: "44%", minWidth: 280, background: "rgba(0,0,0,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 16, position: "relative",
            outline: coverDragActive ? `2px dashed ${DS.purple}` : "none",
            outlineOffset: -8,
          }}
        >
          {coverDragActive && (
            <div style={{
              position: "absolute", inset: 8, zIndex: 5, borderRadius: 10,
              background: "rgba(124,58,237,0.18)", backdropFilter: "blur(1px)",
              display: "flex", flexDirection: "column", gap: 6, alignItems: "center", justifyContent: "center",
              color: "#fff", fontSize: 13, fontWeight: 700, pointerEvents: "none",
            }}>
              <span style={{ fontSize: 30 }}>🖼️</span>
              Soltá la imagen acá
            </div>
          )}
          {playing && directVideo ? (
            <video src={directVideo} controls autoPlay playsInline style={{ width: "100%", maxHeight: "82vh", borderRadius: 8, background: "#000" }} />
          ) : playing && drivePreview ? (
            <iframe
              title="Video de Drive"
              src={drivePreview}
              allow="autoplay; encrypted-media"
              allowFullScreen
              style={{ width: "100%", height: "82vh", border: "none", borderRadius: 8, background: "#000" }}
            />
          ) : fileUrl ? (
            <>
              <img
                src={fileUrl}
                alt={variation.label || ""}
                style={{ maxWidth: "100%", maxHeight: "82vh", objectFit: "contain", borderRadius: 8 }}
              />
              {canPlay && (
                <button
                  onClick={() => setPlaying(true)}
                  title="Reproducir el video acá"
                  style={{
                    position: "absolute", inset: 0, margin: "auto", width: 66, height: 66, borderRadius: "50%",
                    border: "none", background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: 26, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)",
                  }}
                >▶</button>
              )}
            </>
          ) : canPlay ? (
            <button
              onClick={() => setPlaying(true)}
              style={{
                padding: "12px 22px", borderRadius: 50, border: "none", background: DS.purple, color: "#fff",
                fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: DS.font,
              }}
            >▶ Reproducir video</button>
          ) : (
            <span style={{ color: DS.textMuted, fontSize: 13 }}>Sin imagen</span>
          )}
          {/* Subir portada: visible SIEMPRE en edición (incl. con el video corriendo)
              y funciona como ZONA DE ARRASTRE — jalás la captura acá y queda subida.
              También pegás con ⌘/Ctrl+V, o hacés click para elegir el archivo. */}
          {canEdit && editing && (
            <>
              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                onChange={handleCoverUpload}
                style={{ display: "none" }}
              />
              <button
                onClick={() => coverInputRef.current?.click()}
                disabled={uploadingCover}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (!coverBtnDrag) setCoverBtnDrag(true); }}
                onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setCoverBtnDrag(true); }}
                onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setCoverBtnDrag(false); }}
                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setCoverBtnDrag(false); const f = e.dataTransfer?.files?.[0]; if (f) uploadCoverFile(f); }}
                title="Arrastrá tu captura acá, pegá con ⌘/Ctrl+V, o hacé click para elegir la imagen"
                style={{
                  position: "absolute", left: 12, bottom: 12, zIndex: 6,
                  padding: coverBtnDrag ? "12px 20px" : "7px 14px", borderRadius: 50,
                  border: coverBtnDrag ? `2px dashed ${DS.purple}` : DS.border,
                  background: coverBtnDrag ? "rgba(124,58,237,0.75)" : "rgba(0,0,0,0.6)",
                  color: "#fff", fontSize: 11, fontWeight: 700,
                  cursor: uploadingCover ? "wait" : "pointer", fontFamily: DS.font,
                  backdropFilter: "blur(2px)", opacity: uploadingCover ? 0.7 : 1,
                  transition: "padding .12s ease, background .12s ease",
                }}
              >
                {uploadingCover ? "Subiendo…" : coverBtnDrag ? "🖼 Soltá la captura acá" : "🖼 Subir portada"}
              </button>
            </>
          )}
        </div>

        {/* Info */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {/* Header */}
          <div style={{
            padding: "18px 22px 14px", borderBottom: `1px solid ${DS.textHint}`,
            display: "flex", alignItems: "flex-start", gap: 12,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: DS.textMuted, marginBottom: 5 }}>
                {conceptName || "Referencia"}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <h3 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{variation?.label || "—"}</h3>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 50,
                  color: stColor, border: `1px solid ${stColor}55`, background: `${stColor}1A`,
                }}>
                  {STATE_LABEL[state] || state}
                </span>
              </div>
              {variation?.origin_company_name && (
                <div style={{ fontSize: 11, color: DS.textMuted, marginTop: 5 }}>
                  🏷 {variation.origin_company_name}
                </div>
              )}
              <div style={{ marginTop: 10 }}>
                <LinkBadges hasMeta={hasMeta} hasDrive={hasDrive} />
              </div>
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
            {!editing ? (
              <>
                <Field label="Nombre / hook">
                  <span style={{ color: name ? DS.textPrimary : DS.textMuted, fontSize: 13 }}>
                    {name || "Sin nombre"}
                  </span>
                </Field>
                <Field label="Link Biblioteca de Anuncios Meta">
                  {metaUrl
                    ? <a href={metaUrl} target="_blank" rel="noreferrer" style={linkStyle}>{metaUrl} ↗</a>
                    : <span style={missingStyle}>✗ Falta este link</span>}
                </Field>
                <Field label="Link de respaldo (Drive)">
                  {driveUrl
                    ? <a href={driveUrl} target="_blank" rel="noreferrer" style={linkStyle}>{driveUrl} ↗</a>
                    : <span style={missingStyle}>✗ Falta este link</span>}
                </Field>
                <Field label="Notas · cómo está hecho">
                  <span style={{ color: notes ? DS.textSecondary : DS.textMuted, fontSize: 13, whiteSpace: "pre-wrap" }}>
                    {notes || "—"}
                  </span>
                </Field>
                <Field label="Guion / transcripción del video">
                  {transcript ? (
                    <div style={{ maxHeight: 220, overflowY: "auto", padding: "10px 12px", borderRadius: 8, background: DS.bgCard, border: DS.border, color: DS.textSecondary, fontSize: 12.5, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                      {transcript}
                    </div>
                  ) : (
                    <span style={{ color: DS.textMuted, fontSize: 12 }}>Sin transcripción. Analizá con IA para generarla.</span>
                  )}
                </Field>
                <Field label="Etiquetas">
                  <LabelChips v={{ bank_labels: labels }} max={20} />
                  {!hasAnyLabel({ bank_labels: labels }) && <span style={{ color: DS.textMuted, fontSize: 12 }}>Sin etiquetas</span>}
                </Field>
              </>
            ) : (
              <>
                <Field label="Nombre / hook">
                  <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80}
                    placeholder="Ej: Mamá mostrando antes/después" style={inputStyle} />
                </Field>
                <Field label="Link Biblioteca de Anuncios Meta">
                  <input value={metaUrl} onChange={(e) => setMetaUrl(e.target.value)}
                    placeholder="https://facebook.com/ads/library/..." style={inputStyle} />
                </Field>
                <Field label="Link de respaldo (Drive)">
                  <input value={driveUrl} onChange={(e) => setDriveUrl(e.target.value)}
                    placeholder="https://drive.google.com/..." style={inputStyle} />
                  {/* Fallback manual: subir el video como archivo (URL Supabase permanente) */}
                  <input
                    ref={videoInputRef}
                    type="file"
                    accept="video/*"
                    onChange={handleVideoUpload}
                    style={{ display: "none" }}
                  />
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                    <button
                      onClick={() => videoInputRef.current?.click()}
                      disabled={uploadingVideo}
                      title="Subir el archivo de video (fallback si no se recupera solo)"
                      style={{ ...ghostBtn, padding: "7px 14px", opacity: uploadingVideo ? 0.7 : 1, cursor: uploadingVideo ? "wait" : "pointer" }}
                    >
                      {uploadingVideo ? "Subiendo…" : "⬆ Subir video"}
                    </button>
                    {uploadingVideo && (
                      <span style={{ fontSize: 11, color: DS.textMuted }}>Subiendo a Supabase…</span>
                    )}
                  </div>
                </Field>
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
                <Field label="Notas · cómo está hecho">
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                    placeholder="Aprendizajes, comentarios, contexto…"
                    style={{ ...inputStyle, resize: "vertical", minHeight: 60, fontFamily: DS.font }} />
                </Field>
                <Field label="Guion / transcripción del video">
                  <textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={6}
                    placeholder="Transcripción del audio del video (se llena sola al analizar con IA)…"
                    style={{ ...inputStyle, resize: "vertical", minHeight: 100, fontFamily: DS.font, lineHeight: 1.5 }} />
                </Field>
                <Field label="Etiquetas por categoría">
                  <LabelEditor value={labels} onChange={setLabels} suggestions={suggestions} />
                </Field>
              </>
            )}
            {error && <div style={{ color: "#E24B4A", fontSize: 12, marginTop: 6 }}>{error}</div>}
          </div>

          {/* Footer acciones */}
          {canEdit && (
            <div style={{
              padding: "12px 22px", borderTop: `1px solid ${DS.textHint}`,
              display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8,
            }}>
              {editing && !isOwnRef && variation?.origin_company_name && (
                <span style={{
                  marginRight: "auto", fontSize: 11, fontWeight: 600, color: "#E2A24B",
                }}>
                  ⚠ Editás una ref de {variation.origin_company_name} (se aplica en su despliegue)
                </span>
              )}
              {!editing ? (
                <button onClick={() => setEditing(true)} style={primaryBtn}>Editar</button>
              ) : (
                <>
                  <button onClick={cancelEdit} disabled={saving} style={ghostBtn}>Cancelar</button>
                  <button onClick={save} disabled={saving || !isDirty}
                    style={{ ...primaryBtn, opacity: saving || !isDirty ? 0.55 : 1 }}>
                    {saving ? "Guardando…" : "Guardar"}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: DS.textMuted, fontWeight: 700, marginBottom: 5 }}>
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
const linkStyle = { color: DS.blue, fontSize: 12, textDecoration: "none", wordBreak: "break-all" };
const missingStyle = { color: "#E2705B", fontSize: 12, fontWeight: 600 };
const primaryBtn = {
  padding: "9px 22px", borderRadius: 50, border: "none", background: "#1D9E75",
  color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: DS.font,
};
const ghostBtn = {
  padding: "9px 16px", borderRadius: 50, border: DS.border, background: "transparent",
  color: DS.textSecondary, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: DS.font,
};
