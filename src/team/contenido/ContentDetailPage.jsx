import { useState, useCallback, useEffect, useRef } from "react";
import { DS, darkInput } from "../../lib/design.js";
import { listFormats } from "../data/guionesDb.js";
import { FormatSelect } from "../guiones/FormatSelect.jsx";
import { fmtShort } from "../../lib/dates.js";
import { updateContentItem, deleteContentItem } from "../data/contentDb.js";
import { RichEditor } from "./RichEditor.jsx";
import { CONTENT_STATUSES, CONTENT_STATUS_LABEL } from "./ContentCard.jsx";
import { TagSelect } from "./TagSelect.jsx";
import { useTagOptions } from "../hooks/useTagOptions.js";
import { canEditContentField, canDeleteContent } from "../lib/permissions.js";
import { EditSubstatusPicker } from "./EditSubstatusPicker.jsx";
import { StatusPicker } from "./StatusPicker.jsx";
import { PublishDestinationsWidget } from "./PublishDestinationsWidget.jsx";

const KINDS = [
  { value: "video", label: "Video", emoji: "🎬" },
  { value: "story", label: "Historia", emoji: "📱" },
  { value: "post", label: "Post", emoji: "📝" },
];
const FORMAT_OPTIONS = ["Instagram", "TikTap", "YouTube", "Facebook", "LinkedIn", "Twitter"];

const STATUS_COLORS = {
  idea: DS.blue, scripting: DS.purple, to_film: DS.amber,
  to_edit: "#EC4899", to_post: "#06B6D4", posted: DS.green,
};

export function ContentDetailPage({ item, members, currentMember, onBack, onSaved }) {
  const [title, setTitle] = useState(item.title || "");
  const [kind, setKind] = useState(item.kind || "video");
  const [status, setStatus] = useState(item.status || "idea");
  const [tipo, setTipo] = useState(item.tipo || "");
  const [formato, setFormato] = useState(item.formato || []);
  const [referenciaUrl, setReferenciaUrl] = useState(item.referencia_url || "");
  const [linkLoom, setLinkLoom] = useState(item.link_loom || "");
  const [contenidoCrudo, setContenidoCrudo] = useState(item.contenido_crudo_url || "");
  const [videoEditado, setVideoEditado] = useState(item.video_editado_url || "");
  const [linkFinal, setLinkFinal] = useState(item.link_video_final || "");
  const [scheduledDate, setScheduledDate] = useState(item.scheduled_date || "");
  const [editDueDate, setEditDueDate] = useState(item.edit_due_date || "");
  const [storyCategory, setStoryCategory] = useState(item.story_category || "");
  const [editorId, setEditorId] = useState(item.assigned_editor_id || "");
  const [body, setBody] = useState(item.body || "");
  const [editSubstatus, setEditSubstatus] = useState(item.edit_substatus || null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const autosaveTimerRef = useRef(null);

  // Re-sync local state when item changes via realtime (e.g., when a script is approved elsewhere)
  useEffect(() => {
    if (dirty) return; // don't overwrite unsaved user edits
    setTitle(item.title || "");
    setStatus(item.status || "idea");
    setTipo(item.tipo || "");
    setFormato(item.formato || []);
    setReferenciaUrl(item.referencia_url || "");
    setLinkLoom(item.link_loom || "");
    setContenidoCrudo(item.contenido_crudo_url || "");
    setVideoEditado(item.video_editado_url || "");
    setLinkFinal(item.link_video_final || "");
    setScheduledDate(item.scheduled_date || "");
    setEditDueDate(item.edit_due_date || "");
    setStoryCategory(item.story_category || "");
    setEditorId(item.assigned_editor_id || "");
    setBody(item.body || "");
    setEditSubstatus(item.edit_substatus || null);
  }, [item.id, item.body, item.formato, item.status, item.edit_substatus, item.edit_due_date]);

  const editors = (members || []).filter((m) => m.role === "editor" || m.role === "admin");
  const canEdit = (field) => canEditContentField(currentMember, field);
  const canDelete = canDeleteContent(currentMember);
  const formatoGroup = kind === "story" ? "tipo_story" : "formato";
  const [scriptFormats, setScriptFormats] = useState([]);
  useEffect(() => { listFormats().then(({ data }) => setScriptFormats(data || [])); }, []);
  const tipoGroup = kind === "story" ? "tipo_story" : "tipo";
  const formatoTags = useTagOptions("formato");
  const tipoStoryTags = useTagOptions("tipo_story");
  const tipoTags = useTagOptions("tipo");

  const activeFormatoTags = kind === "story" ? tipoStoryTags : formatoTags;
  const activeTipoTags = kind === "story" ? tipoStoryTags : tipoTags;

  const markDirty = () => setDirty(true);

  const save = useCallback(async () => {
    setSaving(true);
    const payload = {};
    if (canEdit("title")) payload.title = title.trim() || "Sin título";
    if (canEdit("kind")) payload.kind = kind;
    if (canEdit("status")) payload.status = status;
    if (canEdit("body")) payload.body = body;
    if (canEdit("tipo")) payload.tipo = tipo.trim() || null;
    if (canEdit("formato")) payload.formato = formato.length ? formato : null;
    if (canEdit("referencia_url")) payload.referencia_url = referenciaUrl.trim() || null;
    if (canEdit("link_loom")) payload.link_loom = linkLoom.trim() || null;
    if (canEdit("contenido_crudo_url")) payload.contenido_crudo_url = contenidoCrudo.trim() || null;
    if (canEdit("video_editado_url")) payload.video_editado_url = videoEditado.trim() || null;
    if (canEdit("link_video_final")) payload.link_video_final = linkFinal.trim() || null;
    if (canEdit("scheduled_date")) payload.scheduled_date = scheduledDate || null;
    if (canEdit("edit_due_date")) payload.edit_due_date = editDueDate || null;
    if (canEdit("story_category")) payload.story_category = kind === "story" ? (storyCategory || null) : null;
    if (canEdit("assigned_editor_id")) payload.assigned_editor_id = editorId || null;
    if (canEdit("edit_substatus")) {
      // El trigger en DB lo limpia si status != to_edit; acá mantenemos consistencia.
      payload.edit_substatus = status === "to_edit" ? editSubstatus : null;
    }
    const { error } = await updateContentItem(item.id, payload);
    setSaving(false);
    if (error) {
      // Mostrar el error real — antes fallaba silenciosamente y se perdía todo el texto.
      alert(`No se pudo guardar: ${error.message || error.code || "error desconocido"}`);
      return;
    }
    setDirty(false);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
    onSaved?.();
  }, [item.id, title, kind, status, tipo, formato, referenciaUrl, linkLoom, contenidoCrudo, videoEditado, linkFinal, scheduledDate, editDueDate, storyCategory, editorId, body, editSubstatus, currentMember, onSaved]);

  // Autosave: cuando dirty pasa a true, grabamos 900ms después del último
  // cambio. Así el user ve "✓ Guardado" en vez de tener que clickear Guardar
  // y esperar. El manual Guardar sigue funcionando para forzar.
  useEffect(() => {
    if (!dirty) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => { save(); }, 900);
    return () => { if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current); };
  }, [dirty, save]);

  const remove = async () => {
    if (!confirm("¿Borrar este contenido?")) return;
    await deleteContentItem(item.id);
    onSaved?.();
    onBack?.();
  };

  const toggleFormato = (f) => {
    setFormato((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
    markDirty();
  };

  const statusColor = STATUS_COLORS[status] || DS.blue;

  return (
    <div style={{ fontFamily: DS.font, maxWidth: 820, margin: "0 auto" }}>
      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, gap: 10 }}>
        <button onClick={onBack} style={{ background: "transparent", border: "none", color: DS.textSecondary, cursor: "pointer", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
          ← Volver
        </button>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {saving && <span style={{ fontSize: 10, color: DS.textMuted }}>Guardando…</span>}
          {!saving && dirty && <span style={{ fontSize: 10, color: DS.amber }}>Sin guardar</span>}
          {!saving && !dirty && savedFlash && <span style={{ fontSize: 10, color: DS.green }}>✓ Guardado</span>}
          {canDelete && (
            <button onClick={remove} style={{ padding: "7px 14px", borderRadius: 50, border: "1px solid rgba(226,75,74,0.3)", background: "transparent", color: DS.red, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
              🗑
            </button>
          )}
          <button
            onClick={save}
            disabled={saving || !dirty}
            style={{
              padding: "9px 20px", borderRadius: 50, border: "none",
              background: saving || !dirty ? DS.bgCard : DS.textPrimary,
              color: saving || !dirty ? DS.textMuted : DS.bg,
              fontSize: 12, fontWeight: 700,
              cursor: saving ? "wait" : (!dirty ? "default" : "pointer"),
              opacity: !dirty ? 0.6 : 1,
            }}
            title={!dirty ? "Todo guardado" : "Guardar ahora"}
          >
            {saving ? "Guardando…" : (dirty ? "Guardar" : "Guardado")}
          </button>
        </div>
      </div>

      {/* Big title (Notion-style) */}
      <input
        value={title}
        onChange={(e) => { setTitle(e.target.value); markDirty(); }}
        readOnly={!canEdit("title")}
        placeholder="Sin título"
        style={{
          width: "100%", background: "transparent", border: "none", outline: "none",
          color: DS.textPrimary, fontSize: 32, fontWeight: 700, fontFamily: DS.font,
          letterSpacing: "-0.02em", marginBottom: 20, padding: 0,
          cursor: canEdit("title") ? "text" : "default",
        }}
      />

      {/* Properties (Notion-style key-value rows).
          Reorganizamos: arriba lo que necesitás todos los días (links, fechas,
          status). Abajo en un <details> los campos meta (Tipo, Formato,
          Contenido, Editor) que normalmente tocás una sola vez. */}
      <div style={{
        borderTop: DS.border,
        borderBottom: DS.border,
        paddingTop: 10, paddingBottom: 10, marginBottom: 24,
      }}>
        {/* ── Sección visible (lo que más usás) ─────────────────────────── */}

        <PropRow icon="🔗" label="Referencia">
          <input value={referenciaUrl} onChange={(e) => { setReferenciaUrl(e.target.value); markDirty(); }}
            readOnly={!canEdit("referencia_url")}
            placeholder="Empty" style={getPropInput(!canEdit("referencia_url"))} />
        </PropRow>

        <PropRow icon="🎥" label="Link loom">
          <input value={linkLoom} onChange={(e) => { setLinkLoom(e.target.value); markDirty(); }}
            readOnly={!canEdit("link_loom")}
            placeholder="Empty" style={getPropInput(!canEdit("link_loom"))} />
        </PropRow>

        <PropRow icon="📁" label="Contenido en cr...">
          <input value={contenidoCrudo} onChange={(e) => { setContenidoCrudo(e.target.value); markDirty(); }}
            readOnly={!canEdit("contenido_crudo_url")}
            placeholder="Empty" style={getPropInput(!canEdit("contenido_crudo_url"))} />
        </PropRow>

        <PropRow icon="✂️" label="Video editado">
          <input value={videoEditado} onChange={(e) => { setVideoEditado(e.target.value); markDirty(); }}
            readOnly={!canEdit("video_editado_url")}
            placeholder="Empty" style={getPropInput(!canEdit("video_editado_url"))} />
        </PropRow>

        {/* "Link video" eliminado — duplicaba "Video editado". El campo
            link_video_final sigue en DB pero no se edita más desde acá. */}

        <PropRow icon="✂️" label="Fecha edición">
          <input type="date" value={editDueDate} onChange={(e) => { setEditDueDate(e.target.value); markDirty(); }}
            readOnly={!canEdit("edit_due_date")}
            style={{ ...getPropInput(!canEdit("edit_due_date")), width: 160, colorScheme: "light" }} />
        </PropRow>

        <PropRow icon="📤" label="Fecha publicación">
          <input type="date" value={scheduledDate} onChange={(e) => { setScheduledDate(e.target.value); markDirty(); }}
            readOnly={!canEdit("scheduled_date")}
            style={{ ...getPropInput(!canEdit("scheduled_date")), width: 160, colorScheme: "light" }} />
        </PropRow>

        <PropRow icon="🔄" label="Status">
          <StatusPicker
            value={status}
            readOnly={!canEdit("status")}
            onChange={(next) => { setStatus(next); markDirty(); }}
          />
        </PropRow>

        {status === "to_edit" && (
          <PropRow icon="🎞" label="Estado edición">
            <EditSubstatusPicker
              value={editSubstatus}
              readOnly={!canEdit("edit_substatus")}
              onChange={(next) => { setEditSubstatus(next); markDirty(); }}
            />
          </PropRow>
        )}

        {/* Widget de destinos — solo visible cuando ya estamos por publicar. */}
        {(status === "to_post" || status === "posted" || status === "trial" ||
          status === "promoted" || status === "killed") && kind === "video" && (
          <PublishDestinationsWidget
            item={item}
            readOnly={!canEdit("status")}
            onItemUpdated={(updated) => {
              if (updated.status && updated.status !== status) {
                setStatus(updated.status);
              }
              onSaved?.();
            }}
          />
        )}

        {/* ── Sección colapsable "Más opciones" ───────────────────────────── */}
        <details style={{ marginTop: 14 }}>
          <summary style={{
            fontSize: 11, fontWeight: 600, color: DS.textMuted,
            letterSpacing: "0.04em", cursor: "pointer", padding: "8px 0",
            outline: "none", userSelect: "none",
          }}>
            ▾ Más opciones (Tipo, Formato, Contenido, Editor)
          </summary>

          <div style={{ marginTop: 4 }}>
            <PropRow icon="🎯" label="Tipo">
              {canEdit("tipo") ? (
                <TagSelect
                  options={activeTipoTags.options}
                  selected={tipo}
                  onChange={(val) => { setTipo(val); markDirty(); }}
                  onCreateOption={activeTipoTags.createOption}
                  onUpdateOption={activeTipoTags.updateOption}
                  onDeleteOption={activeTipoTags.deleteOption}
                  multi={false}
                  placeholder="Selecciona o crea un tipo…"
                />
              ) : (
                <ReadOnlyText value={tipo} placeholder="—" />
              )}
            </PropRow>

            <PropRow icon="📺" label="Formato">
              {canEdit("formato") ? (
                <FormatSelect
                  formats={scriptFormats}
                  value={scriptFormats.find((f) => f.name === (Array.isArray(formato) ? formato[0] : formato))?.id || ""}
                  onChange={(id) => {
                    const f = scriptFormats.find((sf) => sf.id === id);
                    setFormato(f ? [f.name] : []);
                    markDirty();
                  }}
                  placeholder="Selecciona formato..."
                />
              ) : (
                <ReadOnlyText value={(Array.isArray(formato) ? formato.join(", ") : formato) || ""} placeholder="—" />
              )}
            </PropRow>

            <PropRow icon="🎬" label="Contenido">
              <div style={{ display: "flex", gap: 4 }}>
                {KINDS.map((k) => (
                  <button key={k.value} type="button"
                    onClick={() => { if (!canEdit("kind")) return; setKind(k.value); markDirty(); }}
                    disabled={!canEdit("kind")}
                    style={pill(kind === k.value, DS.purple, !canEdit("kind"))}>
                    {k.emoji} {k.label}
                  </button>
                ))}
              </div>
            </PropRow>

            {kind === "story" && (
              <PropRow icon="📱" label="Categoría">
                {canEdit("story_category") ? (
                  <TagSelect
                    options={tipoStoryTags.options}
                    selected={storyCategory}
                    onChange={(val) => { setStoryCategory(val); markDirty(); }}
                    onCreateOption={tipoStoryTags.createOption}
                    onUpdateOption={tipoStoryTags.updateOption}
                    onDeleteOption={tipoStoryTags.deleteOption}
                    multi={false}
                    placeholder="Selecciona categoría…"
                  />
                ) : (
                  <ReadOnlyText value={storyCategory} placeholder="—" />
                )}
              </PropRow>
            )}

            <PropRow icon="👤" label="Editor">
              {canEdit("assigned_editor_id") ? (
                <select value={editorId} onChange={(e) => { setEditorId(e.target.value); markDirty(); }}
                  style={{ ...getPropInput(), width: 200, cursor: "pointer", colorScheme: "auto" }}>
                  <option value="" style={{ background: DS.bgSide, color: DS.textMuted }}>Sin asignar</option>
                  {editors.map((m) => (
                    <option key={m.id} value={m.id} style={{ background: DS.bgSide, color: DS.textPrimary }}>{m.name}</option>
                  ))}
                </select>
              ) : (
                <ReadOnlyText
                  value={editors.find((m) => m.id === editorId)?.name || ""}
                  placeholder="Sin asignar"
                />
              )}
            </PropRow>
          </div>
        </details>
      </div>

      {/* Rich text body (Notion-like) */}
      <RichEditor
        content={body}
        editable={canEdit("body")}
        onChange={(html) => { setBody(html); markDirty(); }}
        placeholder="Escribe tu contenido, guion, notas… Usa la barra de herramientas para tablas, imágenes, formatos."
      />
    </div>
  );
}

function ReadOnlyText({ value, placeholder }) {
  return (
    <div style={{
      fontSize: 13, color: value ? DS.textPrimary : DS.textMuted,
      padding: "6px 0", minHeight: 22,
    }}>
      {value || placeholder || "—"}
    </div>
  );
}

function PropRow({ icon, label, children }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, padding: "6px 0",
      minHeight: 34,
    }}>
      <span style={{ fontSize: 13, width: 20, textAlign: "center", flexShrink: 0 }}>{icon}</span>
      <span style={{
        fontSize: 13, color: DS.textSecondary, width: 130, flexShrink: 0,
        fontWeight: 500,
      }}>
        {label}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

function getPropInput(readOnly = false) {
  return {
    background: "transparent",
    border: "none",
    borderBottom: DS.border,
    outline: "none",
    color: readOnly ? DS.textSecondary : DS.textPrimary,
    fontSize: 13,
    fontFamily: DS.font,
    padding: "6px 0",
    width: "100%",
    cursor: readOnly ? "default" : "text",
    boxSizing: "border-box",
  };
}

function pill(active, color, disabled = false) {
  return {
    padding: "4px 10px", borderRadius: 50,
    cursor: disabled ? "default" : "pointer",
    border: `1px solid ${active ? color : DS.textHint}`,
    background: active ? color + "22" : "transparent",
    color: active ? DS.textPrimary : DS.textSecondary,
    fontSize: 11, fontWeight: 600,
    opacity: disabled && !active ? 0.55 : 1,
  };
}
