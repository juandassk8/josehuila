import { useEffect, useMemo, useState } from "react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DS } from "../../lib/design.js";
import { createSpace, updateSpace, archiveSpace, reorderSpaces } from "./workspace_tasks_db.js";
import { buildSpaceTree, flattenTree } from "./spacesTree.js";

// Modal/panel ligero para gestionar spaces de una empresa.
// Profundidad máxima 1 (padre → hijo). Drag-and-drop reordena dentro del mismo nivel.

const SPACE_COLORS = ["#378ADD", "#1DB97A", "#F5A623", "#8B5CF6", "#E24B4A", "#EC4899", "#06B6D4", "#F97316"];
const ICONS = ["📁", "📂", "🎬", "📊", "✍️", "🎨", "💼", "🏷️", "🚀", "🧪", "📣", "🗂️"];

// Plantillas one-click cuando la empresa todavía no tiene espacios.
const TEMPLATES = [
  { name: "Contenido orgánico", icon: "🎬", color: "#1DB97A" },
  { name: "Anuncios",           icon: "📣", color: "#E24B4A" },
  { name: "Logística",          icon: "📦", color: "#F5A623" },
  { name: "Operaciones",        icon: "💼", color: "#8B5CF6" },
  { name: "Guiones",            icon: "✍️", color: "#EC4899" },
  { name: "Diseño",             icon: "🎨", color: "#06B6D4" },
];

export function SpaceManager({ companyId, spaces, onClose, onReload, initialEditId, initialNewParentId }) {
  const [editing, setEditing] = useState(null); // space object o { name, icon, color, parent_id } para nuevo
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Pre-seedeo el form cuando me abren con un editId o newParentId.
  useEffect(() => {
    if (initialEditId) {
      const s = (spaces || []).find((x) => x.id === initialEditId);
      if (s) setEditing(s);
    } else if (initialNewParentId) {
      setEditing({
        name: "", icon: "📁", color: SPACE_COLORS[0],
        parent_id: initialNewParentId,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEditId, initialNewParentId]);

  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", h);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const tree = useMemo(() => buildSpaceTree(spaces || []), [spaces]);
  const flat = useMemo(() => flattenTree(tree), [tree]);

  // Para depth=1: solo los espacios root pueden ser padres.
  const rootSpaces = useMemo(() => (spaces || []).filter((s) => !s.parent_id), [spaces]);
  // Si edito un root que ya tiene hijos, no puedo cambiar su parent (sería depth 2).
  const editingHasChildren = useMemo(() => {
    if (!editing?.id) return false;
    return (spaces || []).some((s) => s.parent_id === editing.id);
  }, [editing?.id, spaces]);

  const parentOptions = useMemo(() => {
    if (!editing) return [];
    if (editingHasChildren) return []; // no se puede mover bajo otro
    return rootSpaces.filter((s) => s.id !== editing.id);
  }, [editing, editingHasChildren, rootSpaces]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const startNew = (parentId = null) => {
    setError("");
    setEditing({
      name: "", icon: "📁", color: SPACE_COLORS[0],
      parent_id: parentId,
    });
  };

  const createFromTemplate = async (tpl) => {
    setError("");
    setBusy(true);
    const { error: err } = await createSpace(companyId, {
      name: tpl.name,
      icon: tpl.icon,
      color: tpl.color,
      parent_id: null,
      sort_order: (spaces || []).length,
    });
    setBusy(false);
    if (err) {
      setError(err.message || "No se pudo crear el espacio.");
      return;
    }
    onReload?.();
  };

  const save = async () => {
    if (!editing?.name?.trim()) return;
    setError("");
    setBusy(true);
    try {
      const payload = {
        name: editing.name.trim(),
        icon: editing.icon || null,
        color: editing.color || null,
        parent_id: editing.parent_id || null,
      };
      if (editing.id) {
        const { error: err } = await updateSpace(editing.id, payload);
        if (err) { setError(err.message || "No se pudo guardar."); return; }
      } else {
        const { error: err } = await createSpace(companyId, {
          ...payload,
          sort_order: (spaces || []).length,
        });
        if (err) { setError(err.message || "No se pudo crear el espacio."); return; }
      }
      setEditing(null);
      onReload?.();
    } finally {
      setBusy(false);
    }
  };

  const archive = async (id) => {
    if (!confirm("¿Archivar este espacio? Las tareas quedan sin espacio.")) return;
    setError("");
    const { error: err } = await archiveSpace(id);
    if (err) { setError(err.message || "No se pudo archivar."); return; }
    if (editing?.id === id) setEditing(null);
    onReload?.();
  };

  // Drag & drop: reorder dentro del mismo nivel (root↔root o hijos del mismo padre).
  const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const sourceSpace = (spaces || []).find((s) => s.id === active.id);
    const overSpace = (spaces || []).find((s) => s.id === over.id);
    if (!sourceSpace || !overSpace) return;
    // Solo permito reorden si comparten el mismo parent (incluyendo ambos null = roots).
    if ((sourceSpace.parent_id || null) !== (overSpace.parent_id || null)) return;

    const siblings = (spaces || [])
      .filter((s) => (s.parent_id || null) === (sourceSpace.parent_id || null))
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const filtered = siblings.filter((s) => s.id !== active.id);
    const overIdx = filtered.findIndex((s) => s.id === over.id);
    const insertIdx = overIdx < 0 ? filtered.length : overIdx;
    filtered.splice(insertIdx, 0, sourceSpace);

    const updates = filtered.map((s, i) => ({ id: s.id, sort_order: (i + 1) * 10 }));
    const { error: err } = await reorderSpaces(updates);
    if (err) setError(err.message || "No se pudo reordenar.");
    onReload?.();
  };

  const showTemplates = (spaces || []).length === 0 && !editing;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
        zIndex: 10003, display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20, fontFamily: DS.font,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: DS.bgSide, border: DS.border,
          borderRadius: 16, width: "100%", maxWidth: 560,
          color: DS.textPrimary, padding: "22px 24px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
          maxHeight: "90vh", overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: "-0.01em" }}>
              Espacios
            </h3>
            <div style={{ fontSize: 11, color: DS.textMuted, marginTop: 2 }}>
              Agrupa tareas (Marketing, Contenido, Operaciones…)
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "transparent", border: "none", color: DS.textMuted,
            cursor: "pointer", fontSize: 16,
          }}>×</button>
        </div>

        {error && (
          <div style={{
            padding: "8px 12px", marginBottom: 12, borderRadius: 8,
            background: `${DS.red}18`, border: `1px solid ${DS.red}55`,
            color: DS.red, fontSize: 12,
          }}>
            {error}
          </div>
        )}

        {/* Plantillas rápidas (solo cuando no hay espacios todavía) */}
        {showTemplates && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: DS.textMuted, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
              Empezá rápido
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
              {TEMPLATES.map((tpl) => (
                <button
                  key={tpl.name}
                  disabled={busy}
                  onClick={() => createFromTemplate(tpl)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 12px", borderRadius: 10, cursor: busy ? "default" : "pointer",
                    background: `${tpl.color}14`, border: `1px solid ${tpl.color}44`,
                    color: DS.textPrimary, fontFamily: "inherit",
                    fontSize: 12, fontWeight: 600, textAlign: "left",
                    opacity: busy ? 0.5 : 1,
                  }}
                >
                  <span style={{
                    width: 26, height: 26, borderRadius: 7,
                    background: `${tpl.color}33`, display: "flex",
                    alignItems: "center", justifyContent: "center", fontSize: 14,
                  }}>{tpl.icon}</span>
                  {tpl.name}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 10, color: DS.textMuted, marginTop: 8, textAlign: "center" }}>
              Click para crearlo. Podés editar nombre/color/ícono o eliminar después.
            </div>
            <button
              onClick={() => startNew()}
              style={{
                width: "100%", marginTop: 10,
                padding: "10px 12px", borderRadius: 10, cursor: "pointer",
                background: "transparent", border: `1px dashed ${DS.textHint}`,
                color: DS.textSecondary, fontFamily: "inherit",
                fontSize: 12, fontWeight: 600,
              }}
            >
              + Crear espacio personalizado
            </button>
          </div>
        )}

        {/* Lista de espacios existentes con D&D */}
        {(spaces || []).length > 0 && (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={flat.map(({ space }) => space.id)} strategy={verticalListSortingStrategy}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
                {flat.map(({ space: s, depth }) => (
                  <SortableSpaceRow
                    key={s.id}
                    space={s}
                    depth={depth}
                    isEditing={editing?.id === s.id}
                    canAddChild={depth === 0} // solo roots aceptan subespacios (depth 1 max)
                    onEdit={() => { setError(""); setEditing(s); }}
                    onAddChild={() => startNew(s.id)}
                    onArchive={() => archive(s.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {/* Formulario edición / creación */}
        {editing ? (
          <div style={{ padding: "14px 16px", background: DS.bgCard, borderRadius: 12, border: DS.border }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: DS.textMuted, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
              {editing.id ? "Editar" : (editing.parent_id ? "Nuevo subespacio" : "Nuevo espacio")}
            </div>
            <input
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              placeholder="Nombre (ej: Marketing)"
              autoFocus
              style={inputStyle()}
              onKeyDown={(e) => { if (e.key === "Enter") save(); }}
            />

            <div style={{ marginTop: 10, fontSize: 10, fontWeight: 700, color: DS.textMuted, letterSpacing: "0.12em", textTransform: "uppercase" }}>
              Espacio padre (opcional)
            </div>
            <select
              value={editing.parent_id || ""}
              onChange={(e) => setEditing({ ...editing, parent_id: e.target.value || null })}
              disabled={editingHasChildren}
              style={{
                ...inputStyle(),
                marginTop: 4,
                opacity: editingHasChildren ? 0.5 : 1,
                cursor: editingHasChildren ? "not-allowed" : "pointer",
              }}
            >
              <option value="">— Espacio raíz —</option>
              {parentOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.icon || "📁"} {p.name}
                </option>
              ))}
            </select>
            {editingHasChildren && (
              <div style={{ fontSize: 10, color: DS.textMuted, marginTop: 4 }}>
                Este espacio tiene subespacios — no puede ser hijo de otro.
              </div>
            )}

            <div style={{ marginTop: 10, fontSize: 10, fontWeight: 700, color: DS.textMuted, letterSpacing: "0.12em", textTransform: "uppercase" }}>
              Color
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
              {SPACE_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setEditing({ ...editing, color: c })}
                  style={{
                    width: 24, height: 24, borderRadius: "50%",
                    background: c, cursor: "pointer", padding: 0,
                    border: editing.color === c ? `2px solid ${DS.textPrimary}` : "2px solid transparent",
                  }}
                />
              ))}
            </div>
            <div style={{ marginTop: 10, fontSize: 10, fontWeight: 700, color: DS.textMuted, letterSpacing: "0.12em", textTransform: "uppercase" }}>
              Ícono
            </div>
            <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
              {ICONS.map((ic) => (
                <button
                  key={ic}
                  onClick={() => setEditing({ ...editing, icon: ic })}
                  style={{
                    width: 30, height: 30, borderRadius: 8,
                    background: editing.icon === ic ? `${editing.color || DS.blue}22` : "transparent",
                    border: `1px solid ${editing.icon === ic ? (editing.color || DS.blue) + "55" : DS.textHint}`,
                    cursor: "pointer", fontSize: 14,
                  }}
                >{ic}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 12 }}>
              <button onClick={() => { setEditing(null); setError(""); }} style={ghostBtn()}>Cancelar</button>
              <button onClick={save} disabled={busy || !editing.name.trim()} style={primaryBtn()}>
                {busy ? "Guardando…" : (editing.id ? "Guardar" : "Crear")}
              </button>
            </div>
          </div>
        ) : (
          (spaces || []).length > 0 && (
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => startNew()} style={{ ...ghostBtn(), flex: 1, padding: "10px 12px", fontSize: 12 }}>
                + Nuevo espacio
              </button>
              <button onClick={onClose} style={{ ...primaryBtn(), flex: 1, padding: "10px 12px" }}>
                Listo
              </button>
            </div>
          )
        )}
      </div>
    </div>
  );
}

function SortableSpaceRow({ space: s, depth, isEditing, canAddChild, onEdit, onAddChild, onArchive }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: s.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    display: "flex", alignItems: "center", gap: 10,
    padding: "8px 12px", borderRadius: 10,
    marginLeft: depth * 18,
    background: isEditing ? `${s.color || DS.blue}18` : "transparent",
    border: `1px solid ${isEditing ? (s.color || DS.blue) + "55" : DS.textHint}`,
    position: "relative",
  };
  return (
    <div ref={setNodeRef} style={style}>
      {depth > 0 && (
        <span style={{
          position: "absolute", left: -10, top: "50%",
          width: 8, height: 1, background: DS.textHint,
        }} />
      )}
      <span
        {...attributes}
        {...listeners}
        style={{
          cursor: "grab", color: DS.textMuted, fontSize: 14, lineHeight: 1,
          padding: "0 2px", userSelect: "none",
        }}
        title="Arrastrá para reordenar"
      >⋮⋮</span>
      <span style={{
        width: 28, height: 28, borderRadius: 8,
        background: `${s.color || DS.blue}22`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 14, flexShrink: 0,
      }}>{s.icon || "📁"}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: DS.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {s.name}
        </div>
      </div>
      {canAddChild && (
        <button onClick={onAddChild} style={ghostBtn()} title="Crear subespacio">+ Sub</button>
      )}
      <button onClick={onEdit} style={ghostBtn()}>Editar</button>
      <button onClick={onArchive} style={{ ...ghostBtn(), color: DS.red }}>Archivar</button>
    </div>
  );
}

function inputStyle() {
  return {
    width: "100%", padding: "9px 11px", borderRadius: 8,
    background: "transparent", color: DS.textPrimary,
    border: `1px solid ${DS.textHint}`, outline: "none",
    fontSize: 13, fontFamily: DS.font, boxSizing: "border-box",
  };
}

function ghostBtn() {
  return {
    padding: "6px 12px", borderRadius: 8, background: "transparent",
    border: `1px solid ${DS.textHint}`, color: DS.textSecondary,
    fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: DS.font,
  };
}

function primaryBtn() {
  return {
    padding: "8px 16px", borderRadius: 8, border: "none",
    background: DS.textPrimary, color: DS.bg,
    fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: DS.font,
  };
}
