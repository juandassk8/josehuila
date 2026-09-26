import { useEffect, useMemo, useRef, useState } from "react";
import { DS } from "../lib/design.js";
import { useTheme } from "../lib/theme.jsx";
import {
  FEEDBACK_SECTIONS,
  detectSection,
  submitFeedback,
  uploadFeedbackImage,
} from "./feedback_db.js";
import { logger } from "../lib/logger.js";

// Widget flotante de feedback. Botón fijo abajo-derecha → modal con form.
// Se monta una sola vez en App.jsx con `reporter` (info del usuario actual).
// Si reporter == null, no renderiza nada.

export function FeedbackWidget({ reporter }) {
  const { isDark } = useTheme();
  const T = DS;
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  if (!reporter) return null;

  return (
    <>
      {/* Botón flotante */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          title="Enviar feedback"
          style={{
            position: "fixed",
            bottom: 22,
            right: 22,
            zIndex: 9998,
            padding: "11px 18px",
            borderRadius: 50,
            border: "none",
            background: "linear-gradient(135deg, #1DB97A, #0F7B6C)",
            color: "#fff",
            fontSize: 12.5,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: T.font,
            boxShadow: "0 8px 24px rgba(29,185,122,0.35), 0 2px 6px rgba(0,0,0,0.2)",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            letterSpacing: "0.02em",
            transition: "transform 120ms ease, box-shadow 120ms ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-1px)";
            e.currentTarget.style.boxShadow = "0 10px 28px rgba(29,185,122,0.45), 0 2px 8px rgba(0,0,0,0.25)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "0 8px 24px rgba(29,185,122,0.35), 0 2px 6px rgba(0,0,0,0.2)";
          }}
        >
          <span style={{ fontSize: 14 }}>💬</span>
          <span>Feedback</span>
        </button>
      )}

      {open && (
        <FeedbackModal
          reporter={reporter}
          expanded={expanded}
          onToggleExpand={() => setExpanded((v) => !v)}
          onClose={() => { setOpen(false); setExpanded(false); }}
          isDark={isDark}
        />
      )}
    </>
  );
}

function FeedbackModal({ reporter, expanded, onToggleExpand, onClose, isDark }) {
  const T = DS;
  const initialSection = useMemo(
    () => detectSection(typeof window !== "undefined" ? window.location.pathname : ""),
    []
  );

  const [section, setSection] = useState(initialSection);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [loomUrl, setLoomUrl] = useState("");
  // images = array de { url, name, uploading: bool }
  const [images, setImages] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const fileInputRef = useRef(null);

  // ESC cierra
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Paste de imágenes desde clipboard (Cmd+V con screenshot)
  useEffect(() => {
    const handlePaste = (e) => {
      const items = Array.from(e.clipboardData?.items || []);
      const imageItems = items.filter((it) => it.type.startsWith("image/"));
      if (imageItems.length === 0) return;
      e.preventDefault();
      for (const it of imageItems) {
        const file = it.getAsFile();
        if (file) handleUploadImage(file);
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleUploadImage = async (file) => {
    if (!file) return;
    // Optimistic placeholder
    const tempId = `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setImages((prev) => [...prev, { id: tempId, url: null, name: file.name || "imagen", uploading: true }]);
    try {
      const url = await uploadFeedbackImage(file);
      if (!url) throw new Error("upload returned null");
      setImages((prev) => prev.map((im) => im.id === tempId ? { ...im, url, uploading: false } : im));
    } catch (e) {
      logger.error("upload failed", e);
      setImages((prev) => prev.filter((im) => im.id !== tempId));
      setError("No se pudo subir una imagen. Probá de nuevo.");
    }
  };

  const handleFilesPicked = (files) => {
    Array.from(files || []).forEach((f) => {
      if (f.type.startsWith("image/")) handleUploadImage(f);
    });
  };

  const handleDrop = (e) => {
    e.preventDefault();
    handleFilesPicked(e.dataTransfer?.files);
  };

  const removeImage = (id) => {
    setImages((prev) => prev.filter((im) => im.id !== id));
  };

  const canSubmit = title.trim().length > 0 && !submitting && !images.some((im) => im.uploading);

  const onSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    try {
      await submitFeedback({
        ...reporter,
        section,
        title: title.trim(),
        body: body.trim() || null,
        loomUrl: loomUrl.trim() || null,
        images: images.filter((im) => im.url).map((im) => ({ url: im.url, name: im.name })),
        urlPath: typeof window !== "undefined" ? window.location.pathname : null,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
        viewport: typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : null,
      });
      setSent(true);
      setTimeout(() => onClose(), 1400);
    } catch (e) {
      setError(e?.message || "No se pudo enviar el feedback. Probá de nuevo.");
    } finally {
      setSubmitting(false);
    }
  };

  // Estilos del modal — diferentes tamaños según expanded
  const modalSize = expanded
    ? { width: "min(1100px, 96vw)", maxHeight: "94vh" }
    : { width: 460, maxHeight: "80vh" };
  const modalPos = expanded
    ? { top: "50%", left: "50%", transform: "translate(-50%, -50%)" }
    : { bottom: 22, right: 22 };

  return (
    <>
      {/* Backdrop solo en modo expandido */}
      {expanded && (
        <div
          onClick={onClose}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
            zIndex: 9998, backdropFilter: "blur(2px)",
          }}
        />
      )}

      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        style={{
          position: "fixed",
          ...modalPos,
          ...modalSize,
          background: isDark ? "#14141A" : "#FFFFFF",
          border: isDark ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(0,0,0,0.08)",
          borderRadius: 18,
          boxShadow: "0 20px 60px rgba(0,0,0,0.45), 0 4px 16px rgba(0,0,0,0.20)",
          fontFamily: T.font,
          color: T.textPrimary,
          display: "flex", flexDirection: "column",
          zIndex: 9999,
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "14px 18px 12px",
          borderBottom: isDark ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(0,0,0,0.06)",
          display: "flex", alignItems: "center", gap: 10,
          background: "linear-gradient(135deg, rgba(29,185,122,0.12), rgba(15,123,108,0.06))",
        }}>
          <div style={{
            width: 30, height: 30, borderRadius: 10,
            background: "linear-gradient(135deg, #1DB97A, #0F7B6C)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontSize: 15, flexShrink: 0,
          }}>💬</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, letterSpacing: "-0.01em" }}>
              Mandanos feedback
            </div>
            <div style={{ fontSize: 10.5, color: T.textMuted, marginTop: 1 }}>
              Bug, sugerencia, lo que quieras. Lo lee Jose directo.
            </div>
          </div>
          <button
            onClick={onToggleExpand}
            title={expanded ? "Achicar" : "Expandir"}
            style={iconBtn(isDark)}
          >
            {expanded ? "⤢" : "⤢"}
          </button>
          <button onClick={onClose} title="Cerrar" style={iconBtn(isDark)}>✕</button>
        </div>

        {/* Body scrollable */}
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px" }}>
          {sent ? (
            <div style={{
              padding: "30px 16px", textAlign: "center",
            }}>
              <div style={{ fontSize: 38, marginBottom: 10 }}>✅</div>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
                ¡Recibido! Gracias.
              </div>
              <div style={{ fontSize: 11.5, color: T.textMuted }}>
                Lo voy a revisar pronto.
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Sección */}
              <Field label="Sección">
                <select
                  value={section}
                  onChange={(e) => setSection(e.target.value)}
                  style={inputStyle(isDark)}
                >
                  {FEEDBACK_SECTIONS.map((s) => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
              </Field>

              {/* Título */}
              <Field label="Título">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder='Ej: "El botón Aprobar no funciona en Mask Col"'
                  autoFocus
                  style={inputStyle(isDark)}
                  maxLength={140}
                />
              </Field>

              {/* Body con hint */}
              <Field label="Detalle (opcional)">
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Contame qué pasó, qué esperabas que pasara, pasos para reproducir…"
                  rows={expanded ? 8 : 5}
                  style={{ ...inputStyle(isDark), resize: "vertical", lineHeight: 1.55, fontFamily: T.font }}
                />
                <div style={{ fontSize: 10.5, color: T.textMuted, marginTop: 4, lineHeight: 1.4 }}>
                  💡 Podés <strong>pegar capturas</strong> con Cmd+V o arrastrar imágenes acá. También podés grabar un Loom rápido y pegar el link abajo.
                </div>
              </Field>

              {/* Imágenes */}
              <Field label={`Capturas ${images.length > 0 ? `(${images.length})` : ""}`}>
                <div style={{
                  display: "flex", flexWrap: "wrap", gap: 8,
                  padding: 10, borderRadius: 10,
                  background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.025)",
                  border: `1px dashed ${isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`,
                  minHeight: 60,
                }}>
                  {images.length === 0 && (
                    <div style={{
                      fontSize: 11, color: T.textMuted, padding: "12px 8px",
                      width: "100%", textAlign: "center",
                    }}>
                      Pegá (Cmd+V), arrastrá, o usá el botón ↓
                    </div>
                  )}
                  {images.map((im) => (
                    <ImageThumb key={im.id} im={im} isDark={isDark} onRemove={() => removeImage(im.id)} />
                  ))}
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={smallBtn(isDark)}
                  >
                    📁 Subir archivo
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => { handleFilesPicked(e.target.files); e.target.value = ""; }}
                    style={{ display: "none" }}
                  />
                </div>
              </Field>

              {/* Loom URL */}
              <Field label="Link de Loom (opcional)">
                <input
                  type="url"
                  value={loomUrl}
                  onChange={(e) => setLoomUrl(e.target.value)}
                  placeholder="https://loom.com/share/…"
                  style={inputStyle(isDark)}
                />
              </Field>

              {error && (
                <div style={{
                  padding: "8px 12px", borderRadius: 8,
                  background: "rgba(226,75,74,0.10)", color: "#E24B4A",
                  fontSize: 11.5, fontWeight: 600,
                  border: "1px solid rgba(226,75,74,0.25)",
                }}>
                  ⚠ {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer con submit */}
        {!sent && (
          <div style={{
            padding: "12px 18px",
            borderTop: isDark ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(0,0,0,0.06)",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
            background: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.015)",
          }}>
            <div style={{ fontSize: 10.5, color: T.textMuted }}>
              {reporter.companyName ? `${reporter.companyName} · ` : ""}{reporter.reporterName || "Anónimo"}
            </div>
            <button
              onClick={onSubmit}
              disabled={!canSubmit}
              style={{
                padding: "8px 18px", borderRadius: 50, border: "none",
                background: canSubmit
                  ? "linear-gradient(135deg, #1DB97A, #0F7B6C)"
                  : (isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"),
                color: canSubmit ? "#fff" : T.textMuted,
                fontSize: 12, fontWeight: 700,
                cursor: canSubmit ? "pointer" : "not-allowed",
                fontFamily: T.font,
                letterSpacing: "0.02em",
              }}
            >
              {submitting ? "Enviando…" : "Enviar feedback →"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div style={{
        fontSize: 10, fontWeight: 700, color: DS.textMuted,
        letterSpacing: "0.10em", textTransform: "uppercase",
        marginBottom: 5,
      }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function ImageThumb({ im, isDark, onRemove }) {
  return (
    <div style={{
      position: "relative",
      width: 90, height: 90, borderRadius: 8,
      background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
      overflow: "hidden",
      border: isDark ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(0,0,0,0.08)",
    }}>
      {im.uploading ? (
        <div style={{
          width: "100%", height: "100%",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, color: DS.textMuted,
        }}>Subiendo…</div>
      ) : (
        <a href={im.url} target="_blank" rel="noopener noreferrer" style={{ display: "block", height: "100%" }}>
          <img src={im.url} alt={im.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        </a>
      )}
      <button
        onClick={onRemove}
        title="Quitar"
        style={{
          position: "absolute", top: 3, right: 3,
          width: 20, height: 20, borderRadius: "50%",
          border: "none", background: "rgba(0,0,0,0.6)",
          color: "#fff", fontSize: 12, fontWeight: 700,
          cursor: "pointer", padding: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          lineHeight: 1,
        }}
      >×</button>
    </div>
  );
}

function inputStyle(isDark) {
  return {
    width: "100%",
    padding: "9px 12px",
    borderRadius: 9,
    border: isDark ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(0,0,0,0.12)",
    background: isDark ? "rgba(255,255,255,0.04)" : "#FFFFFF",
    color: DS.textPrimary,
    fontSize: 12.5, fontFamily: DS.font,
    outline: "none",
    boxSizing: "border-box",
  };
}

function iconBtn(isDark) {
  return {
    width: 28, height: 28, borderRadius: 8,
    border: "none",
    background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
    color: DS.textSecondary,
    fontSize: 12, fontWeight: 700, cursor: "pointer",
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    fontFamily: DS.font, flexShrink: 0,
  };
}

function smallBtn(isDark) {
  return {
    padding: "5px 12px", borderRadius: 50,
    border: isDark ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(0,0,0,0.12)",
    background: "transparent",
    color: DS.textSecondary,
    fontSize: 10.5, fontWeight: 600, cursor: "pointer",
    fontFamily: DS.font,
  };
}
