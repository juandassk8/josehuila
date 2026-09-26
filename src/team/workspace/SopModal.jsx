import { useEffect, useState } from "react";
import { DS, darkInput, darkBtn, darkBtnGhost } from "../../lib/design.js";
import { createSop, updateSop, deleteSop } from "../data/sopsDb.js";

// Modal para crear/editar un SOP (solo admin).
// sop: null = crear; objeto = editar
// existingGroups: array de { group_title, group_sort } para reutilizar
// ownerId: para inserts
export function SopModal({ sop, ownerId, existingGroups, onClose, onSaved }) {
  const isEdit = !!sop?.id;
  const [title, setTitle] = useState(sop?.title || "");
  const [groupTitle, setGroupTitle] = useState(sop?.group_title || (existingGroups[0]?.group_title || ""));
  const [groupSubtitle, setGroupSubtitle] = useState(sop?.group_subtitle || "");
  const [groupSort, setGroupSort] = useState(sop?.group_sort ?? (existingGroups[existingGroups.length - 1]?.group_sort ?? 0) + 1);
  const [focusText, setFocusText] = useState(sop?.focus_text || "");
  const [loomUrl, setLoomUrl] = useState(sop?.loom_url || "");
  const [docUrl, setDocUrl] = useState(sop?.doc_url || "");
  const [sortOrder, setSortOrder] = useState(sop?.sort_order ?? 1);
  const [saving, setSaving] = useState(false);
  const [customGroup, setCustomGroup] = useState(false);

  useEffect(() => {
    // Si el group_title actual no coincide con ninguno existente, marcamos custom.
    if (sop?.group_title && !existingGroups.some((g) => g.group_title === sop.group_title)) {
      setCustomGroup(true);
    }
  }, [sop, existingGroups]);

  const save = async () => {
    if (!title.trim() || !groupTitle.trim()) return;
    setSaving(true);
    const payload = {
      owner_id: ownerId,
      title: title.trim(),
      group_title: groupTitle.trim(),
      group_subtitle: groupSubtitle.trim() || null,
      group_sort: Number(groupSort) || 0,
      focus_text: focusText.trim() || null,
      loom_url: loomUrl.trim() || null,
      doc_url: docUrl.trim() || null,
      sort_order: Number(sortOrder) || 0,
    };
    if (isEdit) await updateSop(sop.id, payload);
    else await createSop(payload);
    setSaving(false);
    onSaved?.();
  };

  const remove = async () => {
    if (!confirm("¿Eliminar este SOP?")) return;
    await deleteSop(sop.id);
    onSaved?.();
  };

  const handleGroupChange = (val) => {
    if (val === "__custom__") { setCustomGroup(true); setGroupTitle(""); return; }
    const found = existingGroups.find((g) => g.group_title === val);
    setGroupTitle(val);
    if (found) {
      setGroupSort(found.group_sort);
      setGroupSubtitle(found.group_subtitle || "");
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 500, padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: DS.bgSide, border: DS.border, borderRadius: 14,
          padding: 22, width: "min(560px, 100%)", maxHeight: "90vh", overflow: "auto",
          fontFamily: DS.font,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: DS.textPrimary }}>
            {isEdit ? "Editar SOP" : "Nuevo SOP"}
          </div>
          <button onClick={onClose} style={{
            background: "transparent", border: "none", color: DS.textMuted,
            cursor: "pointer", fontSize: 20, lineHeight: 1,
          }}>×</button>
        </div>

        <Label>Sección</Label>
        {customGroup ? (
          <input
            value={groupTitle}
            onChange={(e) => setGroupTitle(e.target.value)}
            placeholder="Ej: SECCIÓN 1: El ADN del Cargo"
            style={darkInput}
          />
        ) : (
          <select
            value={groupTitle}
            onChange={(e) => handleGroupChange(e.target.value)}
            style={{ ...darkInput, cursor: "pointer" }}
          >
            {existingGroups.map((g) => (
              <option key={g.group_title} value={g.group_title}>{g.group_title}</option>
            ))}
            <option value="__custom__">+ Nueva sección…</option>
          </select>
        )}
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <div style={{ flex: 1 }}>
            <Label>Subtítulo sección</Label>
            <input
              value={groupSubtitle}
              onChange={(e) => setGroupSubtitle(e.target.value)}
              placeholder="(opcional)"
              style={darkInput}
            />
          </div>
          <div style={{ width: 80 }}>
            <Label>Orden</Label>
            <input type="number" value={groupSort}
              onChange={(e) => setGroupSort(e.target.value)}
              style={darkInput}
            />
          </div>
        </div>

        <div style={{ borderTop: DS.border, marginTop: 16, paddingTop: 16 }}>
          <Label>Título del SOP</Label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ej: 1. Misión y Visión de InForce"
            style={darkInput}
          />

          <Label>En qué enfocarte</Label>
          <textarea
            value={focusText}
            onChange={(e) => setFocusText(e.target.value)}
            rows={3}
            placeholder="(opcional) Qué debe entender quien abre este SOP"
            style={{ ...darkInput, resize: "vertical" }}
          />

          <Label>🎥 Loom URL</Label>
          <input
            value={loomUrl}
            onChange={(e) => setLoomUrl(e.target.value)}
            placeholder="https://loom.com/..."
            style={darkInput}
          />

          <Label>📄 Documento URL</Label>
          <input
            value={docUrl}
            onChange={(e) => setDocUrl(e.target.value)}
            placeholder="https://docs.google.com/..."
            style={darkInput}
          />

          <Label>Orden dentro de la sección</Label>
          <input type="number" value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            style={{ ...darkInput, width: 80 }}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 18 }}>
          <div>
            {isEdit && (
              <button onClick={remove} style={{
                ...darkBtnGhost,
                color: DS.red, borderColor: "rgba(226,75,74,0.3)",
              }}>Eliminar</button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} style={darkBtnGhost}>Cancelar</button>
            <button onClick={save} disabled={saving || !title.trim()} style={{
              ...darkBtn, opacity: saving || !title.trim() ? 0.5 : 1,
            }}>
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Label({ children }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, color: DS.textMuted,
      letterSpacing: "0.12em", margin: "10px 0 4px",
    }}>{children}</div>
  );
}
