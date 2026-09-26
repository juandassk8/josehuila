import { useEffect, useMemo, useRef, useState } from "react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DS } from "../../lib/design.js";
import { useTheme } from "../../lib/theme.jsx";
import { useTareasData } from "./TareasDataContext.jsx";
import { archiveSpace, reorderSpaces } from "./workspace_tasks_db.js";
import { buildSpaceTree } from "./spacesTree.js";

// Sección de espacios embebida en el sidebar principal de CompanyWorkspace.
// Aparece sólo cuando estás en la sección "Tareas". Lee state del
// TareasDataContext compartido con CompanyTareas.

export function TareasSpacesSection({ onPick }) {
  const { isDark } = useTheme();
  const T = DS;
  const data = useTareasData();
  if (!data) return null;

  const {
    companyId, tasks, spaces, activeSpaceId, setActiveSpaceId,
    reloadSpaces, openManager,
  } = data;

  const collapseKey = `tareas_sidebar_collapse_${companyId}`;
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const raw = localStorage.getItem(collapseKey);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
  });
  const toggleCollapse = (rootId) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(rootId)) next.delete(rootId); else next.add(rootId);
      try { localStorage.setItem(collapseKey, JSON.stringify([...next])); } catch {
        // ignore
      }
      return next;
    });
  };

  const tree = useMemo(() => buildSpaceTree(spaces || []), [spaces]);

  const counts = useMemo(() => {
    const c = { total: 0, none: 0, bySpace: {} };
    for (const t of tasks || []) {
      if (t.deleted_at) continue;
      c.total++;
      if (!t.space_id) c.none++;
      else c.bySpace[t.space_id] = (c.bySpace[t.space_id] || 0) + 1;
    }
    return c;
  }, [tasks]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const a = (spaces || []).find((s) => s.id === active.id);
    const b = (spaces || []).find((s) => s.id === over.id);
    if (!a || !b) return;
    if ((a.parent_id || null) !== (b.parent_id || null)) return;
    const siblings = (spaces || [])
      .filter((s) => (s.parent_id || null) === (a.parent_id || null))
      .sort((x, y) => (x.sort_order || 0) - (y.sort_order || 0));
    const filtered = siblings.filter((s) => s.id !== active.id);
    const overIdx = filtered.findIndex((s) => s.id === over.id);
    const insertIdx = overIdx < 0 ? filtered.length : overIdx;
    filtered.splice(insertIdx, 0, a);
    const updates = filtered.map((s, i) => ({ id: s.id, sort_order: (i + 1) * 10 }));
    await reorderSpaces(updates);
    reloadSpaces?.();
  };

  const handleArchive = async (s) => {
    if (!confirm(`¿Archivar "${s.name}"? Las tareas quedan sin espacio.`)) return;
    await archiveSpace(s.id);
    if (activeSpaceId === s.id) setActiveSpaceId(null);
    reloadSpaces?.();
  };

  const visibleIds = useMemo(() => {
    const out = [];
    for (const root of tree) {
      out.push(root.id);
      if (!collapsed.has(root.id)) {
        for (const child of root.children) out.push(child.id);
      }
    }
    return out;
  }, [tree, collapsed]);

  return (
    <div data-tour="espacios-trabajo" style={{ marginTop: 4, marginBottom: 14 }}>
      {/* Header */}
      <div style={{
        padding: "0 22px 8px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span style={{
          fontSize: 9, fontWeight: 700, color: T.textMuted,
          letterSpacing: "0.18em",
        }}>ESPACIOS</span>
        <button
          onClick={() => openManager()}
          title="Gestionar"
          style={{
            width: 18, height: 18, padding: 0,
            background: "transparent", border: "none",
            color: T.textMuted, cursor: "pointer", fontSize: 11,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >⚙</button>
      </div>

      <div style={{ padding: "0 10px" }}>
        <SidebarSpaceItem
          icon="📋" label="Todos" count={counts.total}
          active={activeSpaceId == null}
          onClick={() => { setActiveSpaceId(null); onPick?.(); }}
          T={T} isDark={isDark}
        />
        <SidebarSpaceItem
          icon="🗂️" label="Sin espacio" count={counts.none}
          active={activeSpaceId === "none"}
          onClick={() => { setActiveSpaceId("none"); onPick?.(); }}
          T={T} isDark={isDark}
        />

        {(spaces || []).length > 0 ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={visibleIds} strategy={verticalListSortingStrategy}>
              <div style={{ marginTop: 4 }}>
                {tree.map((root) => {
                  const isCollapsed = collapsed.has(root.id);
                  return (
                    <div key={root.id}>
                      <SortableSpaceRow
                        space={root}
                        depth={0}
                        active={activeSpaceId === root.id}
                        count={counts.bySpace[root.id] || 0}
                        hasChildren={root.children.length > 0}
                        collapsed={isCollapsed}
                        onToggleCollapse={() => toggleCollapse(root.id)}
                        onClick={() => { setActiveSpaceId(root.id); onPick?.(); }}
                        onEdit={() => openManager({ editId: root.id })}
                        onAddChild={() => openManager({ newParentId: root.id })}
                        onArchive={() => handleArchive(root)}
                        T={T} isDark={isDark}
                      />
                      {!isCollapsed && root.children.map((child) => (
                        <SortableSpaceRow
                          key={child.id}
                          space={child}
                          depth={1}
                          active={activeSpaceId === child.id}
                          count={counts.bySpace[child.id] || 0}
                          hasChildren={false}
                          onClick={() => { setActiveSpaceId(child.id); onPick?.(); }}
                          onEdit={() => openManager({ editId: child.id })}
                          onArchive={() => handleArchive(child)}
                          T={T} isDark={isDark}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <button
            onClick={() => openManager()}
            style={{
              width: "100%", marginTop: 6,
              padding: "7px 10px", borderRadius: 6,
              background: "transparent", color: T.textMuted,
              border: `1px dashed ${T.textHint}`, cursor: "pointer",
              fontSize: 11, fontWeight: 600, fontFamily: T.font,
            }}
          >+ Crear primer espacio</button>
        )}

        {(spaces || []).length > 0 && (
          <button
            onClick={() => openManager()}
            style={{
              width: "100%", marginTop: 6,
              padding: "6px 10px", borderRadius: 6,
              background: "transparent", color: T.textMuted,
              border: "none", cursor: "pointer",
              fontSize: 11, fontWeight: 600, fontFamily: T.font, textAlign: "left",
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
          >+ Nuevo espacio</button>
        )}
      </div>
    </div>
  );
}

function SidebarSpaceItem({ icon, label, count, active, onClick, T, isDark }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        display: "flex", alignItems: "center", gap: 10,
        padding: "7px 12px",
        marginBottom: 1,
        borderRadius: 6,
        border: "none",
        background: active ? (isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)") : "transparent",
        color: active ? T.textPrimary : T.textSecondary,
        cursor: "pointer", fontSize: 12.5,
        fontWeight: active ? 600 : 500,
        fontFamily: T.font, textAlign: "left",
        transition: "background 120ms",
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)"; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
    >
      <span style={{ fontSize: 13, width: 18, textAlign: "center", flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      <span style={{ fontSize: 10, color: T.textMuted, fontVariantNumeric: "tabular-nums" }}>{count}</span>
    </button>
  );
}

function SortableSpaceRow({
  space, depth, active, count, hasChildren, collapsed,
  onToggleCollapse, onClick, onEdit, onAddChild, onArchive,
  T, isDark,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: space.id });
  const [menuOpen, setMenuOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setMenuOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const accent = space.color || T.textPrimary;
  const wrapStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    position: "relative",
  };
  const rowStyle = {
    display: "flex", alignItems: "center", gap: 5,
    padding: "6px 8px",
    paddingLeft: depth === 1 ? 22 : 4,
    borderRadius: 6,
    background: active ? `${accent}1F` : (hover ? (isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)") : "transparent"),
    borderLeft: active ? `3px solid ${accent}` : "3px solid transparent",
    cursor: "pointer", fontFamily: T.font,
    color: active ? T.textPrimary : T.textSecondary,
    transition: "background 120ms",
    marginBottom: 1,
  };

  return (
    <div ref={(node) => { setNodeRef(node); wrapRef.current = node; }} style={wrapStyle}>
      <div
        style={rowStyle}
        onClick={onClick}
        onContextMenu={(e) => { e.preventDefault(); setMenuOpen(true); }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <span
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          style={{
            cursor: "grab", color: T.textMuted, fontSize: 9, lineHeight: 1,
            width: 8, opacity: hover ? 0.7 : 0, userSelect: "none",
            transition: "opacity 120ms",
          }}
          title="Arrastrá para reordenar"
        >⋮⋮</span>

        {depth === 0 && hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleCollapse?.(); }}
            style={{
              width: 14, height: 14, padding: 0, border: "none", background: "transparent",
              color: T.textMuted, cursor: "pointer", display: "flex",
              alignItems: "center", justifyContent: "center", fontSize: 9,
              transform: collapsed ? "rotate(0deg)" : "rotate(90deg)",
              transition: "transform 150ms",
            }}
            title={collapsed ? "Expandir" : "Colapsar"}
          >▸</button>
        ) : (
          <span style={{ width: 14 }} />
        )}

        <span style={{
          width: 18, height: 18, borderRadius: 5,
          background: `${accent}26`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, flexShrink: 0,
        }}>{space.icon || "📁"}</span>

        <span style={{
          flex: 1, fontSize: 12, fontWeight: 600,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{space.name}</span>

        {(hover || active || menuOpen) ? (
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
            title="Opciones"
            style={{
              width: 18, height: 18, padding: 0, border: "none", background: "transparent",
              color: T.textMuted, cursor: "pointer", fontSize: 12, fontWeight: 700,
              lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >⋯</button>
        ) : (
          <span style={{
            fontSize: 10, color: T.textMuted,
            fontVariantNumeric: "tabular-nums", minWidth: 14, textAlign: "right",
          }}>{count || ""}</span>
        )}
      </div>

      {menuOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute", top: "100%", left: 18, marginTop: 2,
            background: T.bgSide, border: T.border, borderRadius: 10,
            padding: 4, boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            zIndex: 1000, minWidth: 170, fontFamily: T.font,
          }}
        >
          <MenuItem onClick={() => { onEdit?.(); setMenuOpen(false); }} T={T}>✏️ Editar</MenuItem>
          {depth === 0 && (
            <MenuItem onClick={() => { onAddChild?.(); setMenuOpen(false); }} T={T}>+ Crear subespacio</MenuItem>
          )}
          <MenuItem onClick={() => { onArchive?.(); setMenuOpen(false); }} T={T} danger>🗑 Archivar</MenuItem>
        </div>
      )}
    </div>
  );
}

function MenuItem({ children, onClick, T, danger }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%", padding: "8px 12px", borderRadius: 6,
        background: "transparent", border: "none", cursor: "pointer",
        color: danger ? T.red : T.textPrimary,
        fontSize: 12, fontWeight: 600, textAlign: "left",
        fontFamily: T.font, display: "block",
      }}
      onMouseEnter={(e) => e.currentTarget.style.background = T.bgCard}
      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
    >
      {children}
    </button>
  );
}
