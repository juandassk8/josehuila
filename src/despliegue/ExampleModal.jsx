import { useCallback, useEffect, useRef, useState } from "react";
import { DS } from "../lib/design.js";
import { useTheme } from "../lib/theme.jsx";
import { createVariation, updateVariation, deleteVariation } from "./db.js";
import { uploadExampleImage } from "./storage.js";
import { LabelEditor, LabelChips } from "./ReferenceLabelUI.jsx";
import { getLabels, hasAnyLabel } from "./labels.js";
import { drivePreviewUrl, isDriveLink, driveDownloadUrl } from "../lib/driveLinks.js";

// Reproductor que entiende ambos respaldos: link de Google Drive → iframe /preview;
// URL de video directa (Supabase/.mp4) → <video>. `cover` = portada para el ▶.
function MediaBlock({ backupUrl, cover, metaUrl, isDark, isVideo = true }) {
  const [playing, setPlaying] = useState(false);
  const isDrive = isDriveLink(backupUrl);
  const drivePreview = isDrive ? drivePreviewUrl(backupUrl) : null;
  const directVideo = backupUrl && !isDrive ? backupUrl : null;
  const canPlay = !!(drivePreview || directVideo);
  const bg = isDark ? "#0B0B0F" : "#F4F3F0";
  if (playing && directVideo) {
    return <video src={directVideo} controls autoPlay playsInline style={{ width: "100%", maxHeight: "80vh", background: "#000", display: "block", borderRadius: 10 }} />;
  }
  if (playing && drivePreview) {
    return <iframe title="Video" src={drivePreview} allow="autoplay; encrypted-media" allowFullScreen style={{ width: "100%", height: "min(80vh, 560px)", border: "none", background: "#000", borderRadius: 10 }} />;
  }
  return (
    <div style={{ position: "relative", width: "100%", minHeight: 240, borderRadius: 10, overflow: "hidden", background: bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {cover ? <img src={cover} alt="" style={{ width: "100%", maxHeight: "78vh", objectFit: "contain", display: "block" }} />
        : <span style={{ color: isDark ? "rgba(255,255,255,0.4)" : "#8A8E8B", fontSize: 13 }}>Sin portada</span>}
      {canPlay ? (
        <button onClick={() => setPlaying(true)} title="Reproducir video" style={{ position: "absolute", inset: 0, margin: "auto", width: 66, height: 66, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.62)", color: "#fff", fontSize: 27, cursor: "pointer" }}>▶</button>
      ) : (isVideo && metaUrl) ? (
        // Solo para VIDEOS sin respaldo reproducible: mandamos a verlo en Meta.
        // En estáticos NO va ningún overlay encima de la imagen (tapaba la portada).
        <a href={metaUrl} target="_blank" rel="noreferrer" title="Ver el anuncio (con video) en Meta" style={{ position: "absolute", inset: 0, margin: "auto", width: 210, height: 44, borderRadius: 50, background: "rgba(0,0,0,0.72)", color: "#fff", fontSize: 12.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>▶ Ver anuncio en Meta ↗</a>
      ) : null}
    </div>
  );
}

// canEdit = admin del equipo (Jose). Los clientes (owner/PM/etc.) ven la referencia
// en SOLO LECTURA: no pueden editar campos ni borrar; ven guion, notas, links como
// botones, etiquetas en desplegable y pueden reproducir el video de Drive inline.
export function ExampleModal({ conceptId, conceptName, variation, onClose, onSaved, canEdit = false, canEditLabels = false, labelSuggestions = {}, isVideo = true }) {
  const { isDark } = useTheme();
  const T = DS;

  const isNew = !variation?.id;
  const [name, setName] = useState(variation?.name || "");
  const [imageUrl, setImageUrl] = useState(variation?.file_url || "");
  const [metaUrl, setMetaUrl] = useState(variation?.meta_ads_library_url || "");
  const [driveUrl, setDriveUrl] = useState(variation?.drive_url || "");
  const [notes, setNotes] = useState(variation?.notes || "");
  const [transcript, setTranscript] = useState(variation?.transcript || "");
  const [labels, setLabels] = useState(() => getLabels(variation));
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
  const [editing, setEditing] = useState(!variation?.id);   // refs nuevas arrancan en edición
  const [showFullGuion, setShowFullGuion] = useState(false);
  const fileInput = useRef();
  const dropRef = useRef();
  const drivePreview = drivePreviewUrl(driveUrl);

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

  const uploadFile = useCallback(async (file) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const url = await uploadExampleImage(file, { conceptId });
      setImageUrl(url);
    } catch (err) {
      setError(`No se pudo subir la imagen: ${err?.message || err}`);
    } finally {
      setUploading(false);
    }
  }, [conceptId]);

  const handleFileChange = (e) => uploadFile(e.target.files?.[0]);
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) uploadFile(file);
  };

  // Cmd/Ctrl+V con una imagen en el clipboard → sube directo a la portada.
  // Si el foco está en un input/textarea, dejamos pasar el paste normal de
  // texto. Si no, interceptamos cuando el clipboard trae una imagen.
  useEffect(() => {
    const onPaste = (e) => {
      const ae = document.activeElement;
      const inEditable = ae && (
        ae.tagName === "INPUT" ||
        ae.tagName === "TEXTAREA" ||
        ae.isContentEditable
      );
      if (inEditable) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (!file) continue;
          e.preventDefault();
          uploadFile(file);
          return;
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [uploadFile]);

  const save = async () => {
    if (!metaUrl.trim()) {
      setError("El link de Meta Ads Library es obligatorio.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const nextLabel = variation?.label || `R${Math.floor(Date.now() / 1000) % 10000}`;
      const payload = {
        label: nextLabel,
        name: name.trim() || null,
        state: variation?.state || "produced",
        file_url: imageUrl.trim() || null,
        meta_ads_library_url: metaUrl.trim(),
        drive_url: driveUrl.trim() || null,
        notes: notes.trim() || null,
        transcript: transcript.trim() || null,
      };
      // Solo un editor con permiso escribe etiquetas — así evitamos que un
      // guardado sin permiso las borre.
      if (canEditLabels) payload.bank_labels = labels;
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
    if (!confirm("¿Eliminar esta referencia? No se puede deshacer.")) return;
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

  const modalBg = isDark ? "#0E0E14" : "#FFFFFF";
  const divider = isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.08)";
  const dashBorder = isDark ? "2px dashed rgba(255,255,255,0.18)" : "2px dashed #C4C6C2";
  const dashBg = isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)";
  const green = isDark ? "#3FCF9B" : "#1D9E75";

  // ── Modo SOLO LECTURA para clientes (no admin) ──
  // ── Vista LIMPIA estilo banco (cliente siempre; admin salvo que toque Editar) ──
  if (!(canEdit && editing)) {
    const guionLong = (transcript || "").length > 600;
    return (
      <div onClick={onClose} data-modal style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 10005,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: T.font, overflowY: "auto",
      }}>
        <div onClick={(e) => e.stopPropagation()} style={{
          background: modalBg, border: divider, borderRadius: 16, width: "min(960px, 96vw)", maxHeight: "92vh",
          display: "flex", color: T.textPrimary, overflow: "hidden",
          boxShadow: isDark ? "0 24px 70px rgba(0,0,0,0.6)" : "0 24px 70px rgba(0,0,0,0.18)",
        }}>
          {/* Columna media */}
          <div style={{ width: "44%", minWidth: 300, background: isDark ? "#0B0B0F" : "#F4F3F0", padding: 16, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <MediaBlock backupUrl={driveUrl} cover={imageUrl} metaUrl={metaUrl} isDark={isDark} isVideo={isVideo} />
          </div>
          {/* Columna info */}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "18px 22px 12px", borderBottom: divider, display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10, color: T.textMuted, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>{conceptName}</div>
                <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.25 }}>{name || variation?.label || "Referencia"}</div>
              </div>
              <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: divider, background: "transparent", color: T.textSecondary, cursor: "pointer", fontSize: 16, flexShrink: 0 }}>×</button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "14px 22px 18px" }}>
              {(metaUrl || driveUrl || (!isVideo && imageUrl)) && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                  {metaUrl && <a href={metaUrl} target="_blank" rel="noreferrer" style={linkBtn(isDark, T)}>↗ Ver en Meta</a>}
                  {isVideo
                    ? driveUrl && <a href={isDriveLink(driveUrl) ? driveDownloadUrl(driveUrl) : driveUrl} download target="_blank" rel="noreferrer" style={linkBtn(isDark, T)}>⬇ Descargar video</a>
                    : imageUrl && <button onClick={() => downloadImage(imageUrl, name || variation?.label)} style={{ ...linkBtn(isDark, T), background: "transparent" }}>⬇ Descargar imagen</button>}
                </div>
              )}

              {notes && <RO label="Notas · cómo está hecho" T={T}>
                <div style={{ whiteSpace: "pre-wrap", fontSize: 13.5, color: T.textSecondary, lineHeight: 1.65 }}>{notes}</div>
              </RO>}

              {transcript && <RO label="Guion / transcripción" T={T}>
                <div style={{ maxHeight: showFullGuion ? "none" : 220, overflowY: showFullGuion ? "visible" : "auto", padding: "12px 14px", borderRadius: 8, background: isDark ? "rgba(255,255,255,0.04)" : "#F7F6F3", border: divider, whiteSpace: "pre-wrap", fontSize: 13, color: T.textSecondary, lineHeight: 1.7 }}>{transcript}</div>
                {guionLong && <button onClick={() => setShowFullGuion((s) => !s)} style={{ ...linkBtn(isDark, T), marginTop: 8, fontSize: 11 }}>{showFullGuion ? "▴ Ver menos" : "▾ Ver guion completo"}</button>}
              </RO>}

              {hasAnyLabel({ bank_labels: labels }) && (
                <div style={{ marginTop: 4 }}>
                  <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: T.textMuted, fontWeight: 700, marginBottom: 6 }}>Etiquetas</div>
                  <LabelChips v={{ bank_labels: labels }} max={20} />
                </div>
              )}
            </div>

            {canEdit && (
              <div style={{ padding: "12px 22px", borderTop: divider, display: "flex", justifyContent: "flex-end" }}>
                <button onClick={() => setEditing(true)} style={{ padding: "8px 18px", borderRadius: 50, border: "none", background: green, color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: T.font }}>✏️ Editar</button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onClose}
      data-modal
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
        zIndex: 10005, display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20, fontFamily: T.font, overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: modalBg, border: divider,
          borderRadius: 14, width: "100%", maxWidth: 520,
          padding: "24px 28px", color: T.textPrimary, margin: "auto",
          boxShadow: isDark ? "0 20px 60px rgba(0,0,0,0.6)" : "0 20px 60px rgba(0,0,0,0.15)",
        }}
      >
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 10, color: T.textMuted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>
            {conceptName}
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: T.textPrimary }}>
            {isNew ? "Nueva referencia" : "Editar referencia"}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <Label T={T} required>Portada</Label>
          {imageUrl ? (
            <div style={{
              position: "relative", borderRadius: 10, overflow: "hidden", border: divider,
              background: isDark ? "#0B0B0F" : "#F4F3F0",
              display: "flex", alignItems: "center", justifyContent: "center",
              minHeight: 280,
            }}>
              <img src={imageUrl} alt="" style={{ width: "100%", maxHeight: 560, objectFit: "contain", display: "block" }} />
              <button
                onClick={() => setImageUrl("")}
                style={{
                  position: "absolute", top: 8, right: 8,
                  padding: "4px 10px", borderRadius: 50, border: "none",
                  background: "rgba(0,0,0,0.7)", color: "#fff",
                  fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: T.font,
                }}
              >
                Cambiar
              </button>
            </div>
          ) : (
            <div
              ref={dropRef}
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => { e.preventDefault(); if (dropRef.current) dropRef.current.style.borderColor = green; }}
              onDragLeave={() => { if (dropRef.current) dropRef.current.style.borderColor = isDark ? "rgba(255,255,255,0.18)" : "#C4C6C2"; }}
              onDrop={handleDrop}
              style={{
                border: dashBorder, borderRadius: 10, padding: "40px 14px",
                textAlign: "center", cursor: "pointer",
                background: dashBg,
                color: T.textSecondary, fontSize: 13,
                transition: "border-color 0.15s",
              }}
            >
              {uploading ? "Subiendo…" : "Haz click, arrastra o pega una imagen"}
              <div style={{ fontSize: 11, color: T.textMuted, marginTop: 6 }}>
                JPG, PNG o WebP · ⌘V también funciona
              </div>
            </div>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            style={{ display: "none" }}
          />
        </div>

        <Row>
          <Label T={T}>Nombre (opcional)</Label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="Ej: Mamá mostrando antes/después"
            style={inputStyle(isDark, T)}
          />
        </Row>

        <Row>
          <Label T={T} required>Link Meta Ads Library</Label>
          <input
            value={metaUrl}
            onChange={(e) => setMetaUrl(e.target.value)}
            placeholder="https://www.facebook.com/ads/library/…"
            style={inputStyle(isDark, T)}
          />
        </Row>

        <Row>
          <Label T={T}>Link de respaldo Drive (opcional)</Label>
          <input
            value={driveUrl}
            onChange={(e) => setDriveUrl(e.target.value)}
            placeholder="https://drive.google.com/…"
            style={inputStyle(isDark, T)}
          />
        </Row>

        <Row>
          <Label T={T}>Notas (opcional)</Label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            style={{ ...inputStyle(isDark, T), resize: "vertical", minHeight: 50, fontFamily: T.font }}
            placeholder="Aprendizajes, contexto…"
          />
        </Row>

        <Row>
          <Label T={T}>Guion / transcripción (opcional)</Label>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={4}
            style={{ ...inputStyle(isDark, T), resize: "vertical", minHeight: 80, fontFamily: T.font, lineHeight: 1.5 }}
            placeholder="Se llena solo al analizar con IA…"
          />
        </Row>

        {canEditLabels && (
          <Row>
            <Label T={T}>Etiquetas</Label>
            <LabelEditor value={labels} onChange={setLabels} suggestions={labelSuggestions} />
          </Row>
        )}

        {error && (
          <div style={{ color: T.red, fontSize: 12, marginBottom: 10 }}>{error}</div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 18, paddingTop: 14, borderTop: divider }}>
          <div>
            {!isNew && (
              <button
                onClick={handleDelete}
                disabled={saving}
                style={{
                  padding: "9px 16px", borderRadius: 50,
                  border: `1px solid ${isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.1)"}`,
                  background: "transparent", color: T.red,
                  fontSize: 12, fontWeight: 600, cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Eliminar
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => { if (variation?.id) setEditing(false); else onClose?.(); }}
              disabled={saving}
              style={{
                padding: "9px 16px", borderRadius: 50,
                border: `1px solid ${isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.1)"}`,
                background: "transparent", color: T.textSecondary,
                fontSize: 12, fontWeight: 600, cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Cancelar
            </button>
            <button
              onClick={save}
              disabled={saving || uploading}
              style={{
                padding: "9px 22px", borderRadius: 50, border: "none",
                background: green, color: isDark ? "#06060A" : "#fff",
                fontSize: 12, fontWeight: 700, cursor: "pointer",
                fontFamily: "inherit",
                opacity: saving || uploading ? 0.6 : 1,
              }}
            >
              {saving ? "Guardando…" : isNew ? "Crear referencia" : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ children }) {
  return <div style={{ marginBottom: 14 }}>{children}</div>;
}

// Bloque de solo-lectura (label + contenido) para la vista del cliente.
function RO({ label, children, T }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: T.textMuted, fontWeight: 700, marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  );
}

// Descarga la imagen de portada (fetch→blob→download para forzar la descarga
// aunque sea cross-origin). Si falla, la abre en otra pestaña.
async function downloadImage(url, label) {
  try {
    const resp = await fetch(url);
    const blob = await resp.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const ext = ((blob.type.split("/")[1] || "jpg").split("+")[0]) || "jpg";
    a.download = `${(label || "referencia").toString().replace(/[^\w\-]+/g, "_")}.${ext}`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } catch { window.open(url, "_blank"); }
}

function linkBtn(isDark, T) {
  return {
    display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 50,
    border: `1px solid ${isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)"}`,
    background: "transparent", color: T.blue, fontSize: 12, fontWeight: 700,
    textDecoration: "none", cursor: "pointer", fontFamily: T.font,
  };
}

function Label({ children, required, T }) {
  return (
    <div style={{ fontSize: 11, color: T.textPrimary, fontWeight: 600, marginBottom: 6 }}>
      {children}
      {required && <span style={{ color: T.red, marginLeft: 3 }}>*</span>}
    </div>
  );
}

function inputStyle(isDark, T) {
  return {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: `1px solid ${isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)"}`,
    background: isDark ? "rgba(255,255,255,0.04)" : "#FFFFFF",
    color: T.textPrimary,
    fontSize: 13,
    fontFamily: "inherit",
    outline: "none",
    boxSizing: "border-box",
  };
}
