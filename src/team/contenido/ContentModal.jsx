import { useState, useEffect } from "react";
import { DS, darkInput } from "../../lib/design.js";
import { createContentItem, updateContentItem, deleteContentItem } from "../data/contentDb.js";
import { CONTENT_STATUSES, CONTENT_STATUS_LABEL, STORY_CATEGORIES } from "./ContentCard.jsx";

const KINDS = [
  { value: "video", label: "Video", emoji: "🎬" },
  { value: "story", label: "Historia", emoji: "📱" },
  { value: "post", label: "Post", emoji: "📝" },
];

const FORMAT_OPTIONS = ["Instagram", "TikTok", "YouTube", "Facebook", "LinkedIn", "Twitter"];

export function ContentModal({ item, members, currentMember, onClose, onSaved }) {
  const isEdit = !!item;
  const [title, setTitle] = useState(item?.title || "");
  const [description, setDescription] = useState(item?.description || "");
  const [kind, setKind] = useState(item?.kind || "video");
  const [status, setStatus] = useState(item?.status || "idea");
  const [tipo, setTipo] = useState(item?.tipo || "");
  const [formato, setFormato] = useState(item?.formato || []);
  const [referenciaUrl, setReferenciaUrl] = useState(item?.referencia_url || "");
  const [linkLoom, setLinkLoom] = useState(item?.link_loom || "");
  const [contenidoCrudo, setContenidoCrudo] = useState(item?.contenido_crudo_url || "");
  const [videoEditado, setVideoEditado] = useState(item?.video_editado_url || "");
  const [linkFinal, setLinkFinal] = useState(item?.link_video_final || "");
  const [guion, setGuion] = useState(item?.guion || "");
  const [scheduledDate, setScheduledDate] = useState(item?.scheduled_date || "");
  const [storyCategory, setStoryCategory] = useState(item?.story_category || "");
  const [editorId, setEditorId] = useState(item?.assigned_editor_id || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const toggleFormato = (f) => {
    setFormato((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  };

  const submit = async () => {
    if (!title.trim()) { setError("Escribe un título."); return; }
    setSaving(true);
    setError("");
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      kind,
      status,
      tipo: tipo.trim() || null,
      formato: formato.length ? formato : null,
      referencia_url: referenciaUrl.trim() || null,
      link_loom: linkLoom.trim() || null,
      contenido_crudo_url: contenidoCrudo.trim() || null,
      video_editado_url: videoEditado.trim() || null,
      link_video_final: linkFinal.trim() || null,
      guion: guion.trim() || null,
      scheduled_date: scheduledDate || null,
      story_category: kind === "story" ? (storyCategory || null) : null,
      assigned_editor_id: editorId || null,
    };
    if (!isEdit) payload.created_by = currentMember?.id;

    const { error: err } = isEdit
      ? await updateContentItem(item.id, payload)
      : await createContentItem(payload);

    setSaving(false);
    if (err) { setError(err.message); return; }
    onSaved?.();
    onClose?.();
  };

  const remove = async () => {
    if (!isEdit || !confirm("¿Borrar este contenido?")) return;
    setSaving(true);
    await deleteContentItem(item.id);
    setSaving(false);
    onSaved?.();
    onClose?.();
  };

  const editors = (members || []).filter((m) => m.role === "editor" || m.role === "admin");

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
        backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-start",
        justifyContent: "center", padding: "40px 20px", zIndex: 9999, fontFamily: DS.font,
      }}
    >
      <div
        style={{
          background: DS.bgSide, border: DS.border,
          borderRadius: 18, padding: 28, width: "100%", maxWidth: 680,
          boxShadow: "0 20px 80px rgba(0,0,0,0.6)", color: DS.textPrimary,
          maxHeight: "calc(100vh - 80px)", overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 10, color: DS.purple, letterSpacing: "0.18em", fontWeight: 700 }}>
            {isEdit ? "EDITAR CONTENIDO" : "NUEVO CONTENIDO"}
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: DS.border, color: DS.textMuted, borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 12 }}>✕</button>
        </div>

        <Field label="Título">
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nombre del video/contenido" style={darkInput} />
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <Field label="Tipo de contenido">
            <div style={{ display: "flex", gap: 6 }}>
              {KINDS.map((k) => (
                <button key={k.value} type="button" onClick={() => setKind(k.value)}
                  style={chip(kind === k.value, DS.purple)}>
                  {k.emoji} {k.label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Estado">
            <select value={status} onChange={(e) => setStatus(e.target.value)}
              style={{ ...darkInput, fontSize: 13 }}>
              {CONTENT_STATUSES.map((s) => (
                <option key={s} value={s} style={{ background: DS.bgSide }}>{CONTENT_STATUS_LABEL[s]}</option>
              ))}
            </select>
          </Field>
          <Field label="Fecha programada">
            <input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)}
              style={{ ...darkInput, fontSize: 13 }} />
          </Field>
        </div>

        <Field label="Tipo / categoría">
          <input value={tipo} onChange={(e) => setTipo(e.target.value)} placeholder="Ej: Autoridad, Educativo, Tendencia…" style={darkInput} />
        </Field>

        {kind === "story" && (
          <Field label="Categoría de historia">
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {STORY_CATEGORIES.map((c) => (
                <button key={c.value} type="button" onClick={() => setStoryCategory(c.value)}
                  style={chip(storyCategory === c.value, c.color)}>
                  {c.label}
                </button>
              ))}
            </div>
          </Field>
        )}

        <Field label="Formato / Plataforma">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {FORMAT_OPTIONS.map((f) => (
              <button key={f} type="button" onClick={() => toggleFormato(f)}
                style={chip(formato.includes(f), DS.blue)}>
                {f}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Editor asignado">
          <select value={editorId} onChange={(e) => setEditorId(e.target.value)}
            style={{ ...darkInput, fontSize: 13 }}>
            <option value="" style={{ background: DS.bgSide }}>Sin asignar</option>
            {editors.map((m) => (
              <option key={m.id} value={m.id} style={{ background: DS.bgSide }}>{m.name} ({m.role})</option>
            ))}
          </select>
        </Field>

        <Field label="Descripción / notas">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)}
            rows={2} placeholder="Idea general, ángulo, notas…"
            style={{ ...darkInput, resize: "vertical", fontFamily: DS.font, lineHeight: 1.5 }} />
        </Field>

        <Field label="Guion / Script">
          <textarea value={guion} onChange={(e) => setGuion(e.target.value)}
            rows={4} placeholder="Escribe o pega el guion aquí…"
            style={{ ...darkInput, resize: "vertical", fontFamily: DS.font, lineHeight: 1.6 }} />
        </Field>

        <div style={{ fontSize: 10, fontWeight: 700, color: DS.textMuted, letterSpacing: "0.14em", textTransform: "uppercase", margin: "18px 0 10px" }}>
          LINKS Y ARCHIVOS
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="🔗 Referencia">
            <input value={referenciaUrl} onChange={(e) => setReferenciaUrl(e.target.value)} placeholder="https://instagram.com/p/…" style={darkInput} />
          </Field>
          <Field label="🎥 Link Loom">
            <input value={linkLoom} onChange={(e) => setLinkLoom(e.target.value)} placeholder="https://loom.com/…" style={darkInput} />
          </Field>
          <Field label="📁 Contenido crudo">
            <input value={contenidoCrudo} onChange={(e) => setContenidoCrudo(e.target.value)} placeholder="Link Drive / Dropbox…" style={darkInput} />
          </Field>
          <Field label="✂️ Video editado">
            <input value={videoEditado} onChange={(e) => setVideoEditado(e.target.value)} placeholder="Link al video editado" style={darkInput} />
          </Field>
        </div>
        <Field label="📌 Link publicado (final)">
          <input value={linkFinal} onChange={(e) => setLinkFinal(e.target.value)} placeholder="https://instagram.com/reel/…" style={darkInput} />
        </Field>

        {error && (
          <div style={{ padding: "10px 12px", background: "rgba(226,75,74,0.1)", border: "1px solid rgba(226,75,74,0.3)", borderRadius: 10, color: DS.red, fontSize: 12, marginBottom: 14 }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 10 }}>
          {isEdit ? (
            <button onClick={remove} disabled={saving} style={{ padding: "10px 16px", borderRadius: 50, border: "1px solid rgba(226,75,74,0.3)", background: "transparent", color: DS.red, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              🗑 Borrar
            </button>
          ) : <div />}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} disabled={saving} style={{ padding: "10px 22px", borderRadius: 50, background: "transparent", border: DS.border, color: DS.textSecondary, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              Cancelar
            </button>
            <button onClick={submit} disabled={saving} style={{ padding: "10px 26px", borderRadius: 50, border: "none", background: DS.textPrimary, color: DS.bg, fontSize: 13, fontWeight: 700, cursor: saving ? "wait" : "pointer" }}>
              {saving ? "Guardando…" : isEdit ? "Guardar" : "Crear contenido"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: DS.textSecondary, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 5 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function chip(active, color) {
  return {
    padding: "6px 12px", borderRadius: 50, cursor: "pointer",
    border: `1px solid ${active ? color : DS.textHint}`,
    background: active ? color + "22" : "transparent",
    color: active ? DS.textPrimary : DS.textSecondary,
    fontSize: 11, fontWeight: 600,
  };
}
