import { useEffect, useMemo, useRef, useState } from "react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DS } from "../../lib/design.js";
import { useTheme } from "../../lib/theme.jsx";
import { archiveSpace, reorderSpaces } from "./workspace_tasks_db.js";
import { buildSpaceTree } from "./spacesTree.js";

// Sidebar lateral de espacios para la página de Tareas del cliente.
// Reemplaza la chip bar horizontal — escala mejor con muchos espacios + subespacios.
// Profundidad máxima 1 (root → hijo). Drag-and-drop reordena dentro del mismo nivel.

export function SpacesSidebar({
  companyId, spaces, tasks,
  activeSpaceId, onSelectSpace,
  onOpenManager,
  onEditSpace, onAddChild,
  onReload,
  open, onClose,
  isMobile,
}) {
  const { isDark } = useTheme();
  const T = DS;

  // Estado de colapso por root, persistido por empresa.
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
        // ignore quota errors
      }
      return next;
    });
  };

  const tree = useMemo(() => buildSpaceTree(spaces || []), [spaces]);

  // Conteos de tareas por espacio (incluye también totales y "sin espacio").
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

  // Drag end: reorder roots ↔ roots o hijos del mismo padre.
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
    onReload?.();
  };

  // Archive con confirm.
  const handleArchive = async (s) => {
    if (!confirm(`¿Archivar "${s.name}"? Las tareas quedan sin espacio.`)) return;
    await archiveSpace(s.id);
    if (activeSpaceId === s.id) onSelectSpace?.(null);
    onReload?.();
  };

  // IDs visibles para SortableContext (respetando colapsos).
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

  if (!open && isMobile) return null;

  const panel = (
    <aside
      data-tour="espacios-trabajo"
      style={{
        width: 248, flexShrink: 0,
        borderRight: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(15,15,15,0.08)"}`,
        background: isDark ? "rgba(255,255,255,0.015)" : "rgba(0,0,0,0.015)",
        display: "flex", flexDirection: "column",
        height: "calc(100vh - 0px)",
        position: isMobile ? "fixed" : "sticky",
        top: 0, left: 0, zIndex: isMobile ? 9999 : 5,
        fontFamily: T.font,
      }}
    >
      {/* Header */}
      <div style={{
        padding: "18px 16px 12px", display: "flex",
        alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: "0.18em",
          color: T.textMuted, textTransform: "uppercase",
        }}>Espacios</div>
        <div style={{ display: "flex", gap: 4 }}>
          <IconBtn title="Gestionar" onClick={onOpenManager} T={T}>⚙</IconBtn>
          {isMobile && <IconBtn title="Cerrar" onClick={onClose} T={T}>✕</IconBtn>}
        </div>
      </div>

      {/* Body scroll */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 8px", display: "flex", flexDirection: "column", gap: 1 }}>
        <SidebarRow
          icon="📋" label="Todos" count={counts.total}
          active={activeSpaceId == null}
          onClick={() => onSelectSpace?.(null)}
          T={T} isDark={isDark}
        />
        <SidebarRow
          icon="🗂️" label="Sin espacio" count={counts.none}
          active={activeSpaceId === "none"}
          onClick={() => onSelectSpace?.("none")}
          T={T} isDark={isDark}
        />

        <div style={{ height: 1, background: isDark ? "rgba(255,255,255,0.06)" : "rgba(15,15,15,0.06)", margin: "8px 4px" }} />

        {(spaces || []).length === 0 ? (
          <div style={{
            padding: "20px 12px", textAlign: "center",
            color: T.textMuted, fontSize: 12,
          }}>
            <div style={{ fontSize: 22, marginBottom: 6 }}>🗂️</div>
            <div style={{ marginBottom: 12 }}>No tenés espacios todavía.</div>
            <button
              onClick={onOpenManager}
              style={{
                padding: "8px 14px", borderRadius: 8, border: "none",
                background: T.textPrimary, color: T.bg,
                fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: T.font,
              }}
            >
              + Crear primer espacio
            </button>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={visibleIds} strategy={verticalListSortingStrategy}>
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
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
                        onClick={() => onSelectSpace?.(root.id)}
                        onEdit={() => onEditSpace?.(root)}
                        onAddChild={() => onAddChild?.(root)}
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
                          onClick={() => onSelectSpace?.(child.id)}
                          onEdit={() => onEditSpace?.(child)}
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
        )}
      </div>

      {/* Footer: + Nuevo espacio */}
      {(spaces || []).length > 0 && (
        <div style={{ padding: "8px 12px 14px", borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.05)" : "rgba(15,15,15,0.06)"}` }}>
          <button
            onClick={onOpenManager}
            style={{
              width: "100%", padding: "8px 10px", borderRadius: 8,
              background: "transparent", color: T.textSecondary,
              border: `1px dashed ${T.textHint}`, cursor: "pointer",
              fontSize: 12, fontWeight: 600, fontFamily: T.font,
            }}
          >
            + Nuevo espacio
          </button>
        </div>
      )}
    </aside>
  );

  if (isMobile) {
    return (
      <>
        <div
          onClick={onClose}
          style={{
            position: "fixed", inset: 0, zIndex: 9998,
            background: "rgba(0,0,0,0.5)",
          }}
        />
        {panel}
      </>
    );
  }
  return panel;
}

function IconBtn({ children, onClick, title, T }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 26, height: 26, borderRadius: 6,
        background: "transparent", border: "none",
        color: T.textMuted, cursor: "pointer",
        fontSize: 13, fontWeight: 600, fontFamily: T.font,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onMouseEnter={(e) => e.currentTarget.style.background = T.bgCard}
      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
    >
      {children}
    </button>
  );
}

function SidebarRow({ icon, label, count, active, onClick, T, isDark }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "7px 10px", borderRadius: 7,
        background: active ? (isDark ? "rgba(255,255,255,0.06)" : "rgba(15,15,15,0.06)") : "transparent",
        border: "none", cursor: "pointer", fontFamily: T.font,
        color: active ? T.textPrimary : T.textSecondary,
        textAlign: "left", width: "100%",
        transition: "background 120ms",
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.03)" : "rgba(15,15,15,0.03)"; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
    >
      <span style={{ fontSize: 14, lineHeight: 1, width: 18, textAlign: "center" }}>{icon}</span>
      <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 10, fontWeight: 600, color: T.textMuted, fontVariantNumeric: "tabular-nums" }}>{count}</span>
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
    display: "flex", alignItems: "center", gap: 6,
    padding: "7px 8px 7px 6px",
    paddingLeft: depth === 1 ? 24 : 6,
    borderRadius: 7,
    background: active ? `${accent}1F` : (hover ? (isDark ? "rgba(255,255,255,0.03)" : "rgba(15,15,15,0.03)") : "transparent"),
    borderLeft: active ? `3px solid ${accent}` : `3px solid transparent`,
    cursor: "pointer", fontFamily: T.font,
    color: active ? T.textPrimary : T.textSecondary,
    transition: "background 120ms",
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
        {/* Drag handle (sólo visible al hover) */}
        <span
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          style={{
            cursor: "grab", color: T.textMuted, fontSize: 11, lineHeight: 1,
            width: 10, opacity: hover ? 0.7 : 0, userSelect: "none",
            transition: "opacity 120ms",
          }}
          title="Arrastrá para reordenar"
        >⋮⋮</span>

        {/* Chevron sólo en roots con hijos */}
        {depth === 0 && hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleCollapse?.(); }}
            style={{
              width: 16, height: 16, padding: 0, border: "none", background: "transparent",
              color: T.textMuted, cursor: "pointer", display: "flex",
              alignItems: "center", justifyContent: "center",
              transform: collapsed ? "rotate(0deg)" : "rotate(90deg)",
              transition: "transform 150ms",
            }}
            title={collapsed ? "Expandir" : "Colapsar"}
          >▸</button>
        ) : (
          <span style={{ width: 16 }} />
        )}

        {/* Icono cuadrado coloreado */}
        <span style={{
          width: 22, height: 22, borderRadius: 6,
          background: `${accent}26`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, flexShrink: 0,
        }}>{space.icon || "📁"}</span>

        {/* Nombre */}
        <span style={{
          flex: 1, fontSize: 12.5, fontWeight: 600,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{space.name}</span>

        {/* "···" — visible al hover, activo, o cuando el menú está abierto */}
        {(hover || active || menuOpen) ? (
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
            title="Opciones"
            style={{
              width: 22, height: 20, padding: 0, border: "none", background: "transparent",
              color: T.textMuted, cursor: "pointer", fontSize: 14, fontWeight: 700,
              lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: 4,
            }}
          >⋯</button>
        ) : (
          <span style={{
            fontSize: 10, fontWeight: 600, color: T.textMuted,
            fontVariantNumeric: "tabular-nums", minWidth: 18, textAlign: "right",
          }}>{count || ""}</span>
        )}
      </div>

      {menuOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute", top: "100%", right: 4, marginTop: 2,
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
