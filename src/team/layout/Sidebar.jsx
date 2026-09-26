import { useState, useRef, useEffect, useMemo } from "react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DS, ROLE_LABEL } from "../../lib/design.js";
import { useTheme } from "../../lib/theme.jsx";
import { updateSpace } from "../data/db.js";

// Permisos especiales por nombre de miembro (además de roles)
const CONTENIDO_ALLOWED_NAMES = ["nat", "nath", "nathalia"]; // admin siempre tiene acceso

// Número de semana ISO (1-53).
function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// "Viernes 25 de julio · semana 30"
function fmtDateLabel() {
  const d = new Date();
  const s = d.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" }).replace(",", "");
  const cap = s.charAt(0).toUpperCase() + s.slice(1);
  return `${cap} · semana ${isoWeek(d)}`;
}

// Nav reagrupado (CLAUDE.md §7): tres grupos. Cada item conserva sus roles/permisos
// exactos de antes — solo cambia el agrupamiento visual, no quién ve qué.
const NAV_GROUPS = [
  {
    label: "Tu día",
    items: [
      { key: "warroom", label: "War Room", icon: "warroom", roles: ["admin", "member", "editor"] },
      { key: "planimpl", label: "Plan de implementación", icon: "planimpl", roles: ["admin"] },
      { key: "agenda", label: "Mi agenda", icon: "agenda", roles: ["admin", "member", "editor"] },
      { key: "rutina", label: "Mi rutina", icon: "rutina", roles: ["admin", "member", "editor"] },
      { key: "contenido", label: "Contenido", icon: "contenido", roles: ["admin", "editor"], allowByName: CONTENIDO_ALLOWED_NAMES, tuZona: (role) => role === "editor" },
    ],
  },
  {
    label: "Creativos",
    items: [
      { key: "empresas", label: "Empresas", icon: "empresas", roles: ["admin", "member"] },
      { key: "banco", label: "Banco de creativos", icon: "banco", roles: ["admin", "member", "editor"] },
      { key: "bandeja", label: "Bandeja", icon: "bandeja", roles: ["admin", "member", "editor"] },
      { key: "adlibrary", label: "Bibliotecas de anuncios", icon: "banco", roles: ["admin", "member", "editor"] },
      { key: "crear-imagenes", label: "Crear imágenes", icon: "banco", roles: ["admin", "member", "editor"] },
    ],
  },
  {
    label: "Personas",
    items: [
      { key: "equipo", label: "Equipo", icon: "equipo", roles: ["admin", "member", "editor"] },
      { key: "guiones", label: "Guionista", icon: "guiones", roles: ["admin", "editor"] },
    ],
  },
];

// Fuera del nav principal (CLAUDE.md §7) pero NADA se pierde: viven en "Más".
const MORE_ITEMS = [
  { key: "tiempo", label: "Mi tiempo", icon: "tiempo", roles: ["admin", "member", "editor"] },
  { key: "tracking", label: "Master Tracking", icon: "tracking", roles: ["admin", "member"] },
  { key: "northstar", label: "North Star", icon: "northstar", roles: ["admin"] },
  { key: "finance", label: "Finanzas", icon: "finance", roles: ["admin"] },
  { key: "feedback", label: "Feedback", icon: "feedback", roles: ["admin"] },
  { key: "trash", label: "Papelera", icon: "trash", roles: ["admin", "member", "editor"] },
];

// Un ítem del nav se ve si el override del miembro lo permite; si no hay override,
// cae al default por rol/nombre. Así denegar una vista (p.ej. finance/planimpl a un
// admin) OCULTA el ítem del menú, no solo redirige al hacer clic.
const canSee = (item, member) => {
  const overrides = member?.access_overrides || {};
  if (Object.prototype.hasOwnProperty.call(overrides, item.key)) return overrides[item.key] === true;
  const role = member?.role || "member";
  const lowerName = (member?.name || "").toLowerCase();
  return item.roles.includes(role) || (item.allowByName && item.allowByName.some((n) => lowerName.startsWith(n)));
};

export function Sidebar({ currentView, onNavigate, member, members, spaces, currentSpaceId, onSelectSpace, onSignOut, onCreateSpace, onEditSpace, onArchiveSpace, onDeleteSpace }) {
  const { isDark, toggleTheme } = useTheme();
  const T = DS;
  const role = member?.role || "member";

  const groups = NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((it) => canSee(it, member)) }))
    .filter((g) => g.items.length > 0);
  const moreItems = MORE_ITEMS.filter((it) => canSee(it, member));

  // Los espacios PRIVADOS son solo de su dueño (ni siquiera otros admins los ven).
  // Todos ven los compartidos. Así las "tareas personales" quedan realmente privadas.
  const visibleSpaces = (spaces || []).filter((s) =>
    s.visibility === "shared" || s.owner_id === member?.id
  );
  const childrenOf = (parentId) => visibleSpaces.filter((s) => s.parent_space_id === parentId);

  // Agrupación por dueño. Clave null = compartidos (shared sin owner).
  const spaceGroups = [];
  spaceGroups.push({
    key: "shared",
    label: "Compartidos",
    roots: visibleSpaces.filter((s) => !s.parent_space_id && s.visibility === "shared"),
  });

  const ownerIds = new Set(
    visibleSpaces
      .filter((s) => s.visibility === "private" && !s.parent_space_id && s.owner_id)
      .map((s) => s.owner_id)
  );

  // Ordenar dueños: yo primero, luego el resto alfabéticamente.
  const ownersSorted = Array.from(ownerIds)
    .map((id) => members?.find((m) => m.id === id))
    .filter(Boolean)
    .sort((a, b) => {
      if (a.id === member?.id) return -1;
      if (b.id === member?.id) return 1;
      return (a.name || "").localeCompare(b.name || "");
    });

  for (const owner of ownersSorted) {
    spaceGroups.push({
      key: `owner_${owner.id}`,
      label: owner.id === member?.id ? `${owner.name} (tú)` : owner.name,
      roots: visibleSpaces.filter((s) => !s.parent_space_id && s.owner_id === owner.id && s.visibility === "private"),
      ownerColor: owner.color,
    });
  }

  const canManageSpaces = role === "admin" || role === "member";

  // Activation constraint memoizado — evita el loop de measurement de @dnd-kit.
  const pointerOptions = useMemo(() => ({ activationConstraint: { distance: 5 } }), []);
  const sensors = useSensors(useSensor(PointerSensor, pointerOptions));

  // Drag & drop: mover espacios entre grupos / reordenar dentro de un grupo.
  const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const sourceSpace = (spaces || []).find((s) => s.id === active.id);
    if (!sourceSpace) return;

    // Caso: drag de un subespacio — reorden dentro del mismo padre.
    if (sourceSpace.parent_space_id) {
      const overSpace = (spaces || []).find((s) => s.id === over.id);
      if (!overSpace || overSpace.parent_space_id !== sourceSpace.parent_space_id) return;
      const siblings = (spaces || [])
        .filter((s) => s.parent_space_id === sourceSpace.parent_space_id)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      const filtered = siblings.filter((s) => s.id !== active.id);
      const overIdx = filtered.findIndex((s) => s.id === over.id);
      const insertIdx = overIdx < 0 ? filtered.length : overIdx;
      filtered.splice(insertIdx, 0, sourceSpace);
      await Promise.all(
        filtered
          .map((s, i) => {
            const newSort = (i + 1) * 10;
            if (s.id === active.id || (s.sort_order || 0) !== newSort) {
              return updateSpace(s.id, { sort_order: newSort });
            }
            return null;
          })
          .filter(Boolean)
      );
      return;
    }

    // Determinar grupo destino desde `over.id`
    let targetOwnerId = null;
    let targetVisibility = "shared";
    const overId = String(over.id);

    if (overId.startsWith("groupzone-shared")) {
      targetOwnerId = null;
      targetVisibility = "shared";
    } else if (overId.startsWith("groupzone-owner_")) {
      targetOwnerId = overId.replace("groupzone-owner_", "");
      targetVisibility = "private";
    } else {
      const overSpace = (spaces || []).find((s) => s.id === over.id);
      if (!overSpace) return;
      if (overSpace.visibility === "shared") {
        targetOwnerId = null;
        targetVisibility = "shared";
      } else {
        targetOwnerId = overSpace.owner_id;
        targetVisibility = "private";
      }
    }

    // Espacios del grupo destino (root only), ordenados
    const groupSpaces = (spaces || [])
      .filter((s) =>
        !s.parent_space_id &&
        (targetVisibility === "shared"
          ? s.visibility === "shared"
          : s.visibility === "private" && s.owner_id === targetOwnerId)
      )
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    // Quitar source si estaba en el grupo destino, insertar antes de over
    const filtered = groupSpaces.filter((s) => s.id !== active.id);
    const overIdx = overId.startsWith("groupzone-")
      ? filtered.length
      : filtered.findIndex((s) => s.id === over.id);
    const insertIdx = overIdx < 0 ? filtered.length : overIdx;
    filtered.splice(insertIdx, 0, sourceSpace);

    // Actualizar: primero ownership del source, luego sort_orders en batch
    if (sourceSpace.visibility !== targetVisibility || sourceSpace.owner_id !== targetOwnerId) {
      await updateSpace(active.id, {
        owner_id: targetOwnerId,
        visibility: targetVisibility,
      });
    }
    await Promise.all(
      filtered.map((s, i) => {
        const newSort = (i + 1) * 10;
        if (s.id === active.id || (s.sort_order || 0) !== newSort) {
          return updateSpace(s.id, { sort_order: newSort });
        }
        return null;
      }).filter(Boolean)
    );
  };

  return (
    <aside
      style={{
        width: 240,
        position: "sticky",
        top: 0,
        alignSelf: "flex-start",
        flexShrink: 0,
        minHeight: "100vh",
        background: T.bgSide,
        borderRight: T.border,
        padding: "20px 0 20px",
        display: "flex",
        flexDirection: "column",
        fontFamily: T.font,
        overflow: "hidden",
      }}
    >
      {/* Halo neón: única fuente de color de fondo del sidebar (CLAUDE.md §1). */}
      <div style={{ position: "absolute", inset: 0, background: "var(--glow)", pointerEvents: "none", zIndex: 0 }} />

      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        {/* Brand + theme toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 18px 18px" }}>
          <div style={{
            width: 42, height: 42, borderRadius: 12,
            background: "var(--surface)", border: `1px solid ${T.neon}55`,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: T.neon, boxShadow: `0 0 22px ${T.neon}3A`,
          }}>
            <Icon name="warroom" size={20} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 16, fontWeight: 800, color: T.textPrimary, letterSpacing: "-0.02em", lineHeight: 1.05,
            }}>Inforce</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.neon, letterSpacing: "-0.01em", marginTop: 1 }}>Central</div>
          </div>
          <button
            onClick={toggleTheme}
            title={isDark ? "Modo claro" : "Modo oscuro"}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "transparent", border: "1px solid var(--line)",
              borderRadius: 10, width: 34, height: 34, cursor: "pointer", color: T.textMuted,
            }}
          >
            <Icon name={isDark ? "sun" : "moon"} size={16} />
          </button>
        </div>

        {member && (
          <div style={{ padding: "0 18px 14px" }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: T.textPrimary, letterSpacing: "-0.03em", lineHeight: 1.05 }}>
              Hola,<br />{(member.name || "").split(" ")[0]}
            </div>
            <div style={{ fontSize: 12.5, color: T.textMuted, marginTop: 9, letterSpacing: "-0.01em" }}>{fmtDateLabel()}</div>
          </div>
        )}

        {/* Buscador (⌘K) */}
        <div style={{ padding: "0 14px 14px" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 9,
            padding: "9px 12px", borderRadius: 12,
            background: T.bgCard, border: T.border, color: T.textMuted,
          }}>
            <Icon name="search" size={15} />
            <span style={{ flex: 1, fontSize: 13, letterSpacing: "-0.01em" }}>Buscar</span>
            <span style={{
              fontSize: 10.5, fontWeight: 600, color: T.textHint,
              padding: "2px 6px", borderRadius: 6, border: "1px solid var(--line)",
              fontFamily: "'JetBrains Mono', monospace",
            }}>⌘K</span>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", minHeight: 0 }}>
          {groups.map((g) => (
            <NavSection key={g.label} label={g.label} T={T}>
              {g.items.map((it) => (
                <NavItem
                  key={it.key}
                  active={currentView === it.key}
                  onClick={() => onNavigate(it.key)}
                  icon={it.icon}
                  label={it.label}
                  T={T}
                  tuZona={typeof it.tuZona === "function" ? it.tuZona(role) : false}
                />
              ))}
            </NavSection>
          ))}

          {moreItems.length > 0 && <MoreSection items={moreItems} currentView={currentView} onNavigate={onNavigate} T={T} />}

          {canManageSpaces && (
            <div style={{ marginTop: 6, marginBottom: 12 }}>
              <div style={{
                fontSize: 10.5, fontWeight: 700, color: T.textMuted, letterSpacing: "0.02em",
                padding: "0 18px 6px", display: "flex", alignItems: "center", gap: 6,
              }}>
                <span style={{ flex: 1 }}>Espacios</span>
                {onCreateSpace && (
                  <button
                    onClick={() => onCreateSpace(null)}
                    title="Nuevo espacio"
                    style={{
                      display: "flex", background: "transparent", border: "none", color: T.textMuted,
                      cursor: "pointer", padding: 2, lineHeight: 1,
                    }}
                  ><Icon name="plus" size={14} /></button>
                )}
              </div>

              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                {spaceGroups.map((g) => {
                  const isOwnGroup = g.key === `owner_${member?.id}`;
                  const defaultExpanded = g.key === "shared" ? false : isOwnGroup;
                  return (
                    <SpaceGroup
                      key={g.key}
                      group={g}
                      childrenOf={childrenOf}
                      currentSpaceId={currentSpaceId}
                      currentView={currentView}
                      onSelectSpace={onSelectSpace}
                      onCreateSpace={onCreateSpace}
                      onEditSpace={onEditSpace}
                      onArchiveSpace={onArchiveSpace}
                      onDeleteSpace={onDeleteSpace}
                      T={T}
                      defaultExpanded={defaultExpanded}
                    />
                  );
                })}
              </DndContext>

              {spaceGroups.every((g) => g.roots.length === 0) && onCreateSpace && (
                <button
                  onClick={() => onCreateSpace(null)}
                  style={{
                    margin: "0 14px", padding: "8px 10px", fontSize: 11.5,
                    background: "transparent", border: T.borderDash, borderRadius: 8,
                    color: T.textMuted, cursor: "pointer", width: "calc(100% - 28px)",
                    textAlign: "left", fontFamily: T.font,
                  }}
                >+ Nuevo espacio</button>
              )}
            </div>
          )}
        </div>

        {/* Ver tutoriales — siempre disponible */}
        <div style={{ margin: "8px 14px 8px" }}>
          <button
            onClick={() => {
              import("../../onboarding/sidebar_highlight.js").then((m) => m.openTutorials());
            }}
            style={{
              width: "100%",
              display: "flex", alignItems: "center", gap: 10,
              padding: "9px 13px", borderRadius: 12,
              background: `${T.neon}12`, border: `1px solid ${T.neon}33`,
              color: T.textSecondary, cursor: "pointer",
              fontSize: 12.5, fontWeight: 600, fontFamily: T.font,
              textAlign: "left", letterSpacing: "-0.01em",
            }}
          >
            <span style={{ color: T.neon, display: "flex" }}><Icon name="play" size={15} /></span>
            <span style={{ flex: 1 }}>Ver tutoriales</span>
          </button>
        </div>

        {member && (
          <div style={{
            margin: "0 14px", padding: "10px 12px", borderRadius: 12,
            background: T.bgCard, border: T.border, display: "flex", alignItems: "center", gap: 10,
          }}>
            <div style={{
              width: 30, height: 30, borderRadius: "50%", background: member.color || DS.blue,
              display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
              fontSize: 12.5, fontWeight: 700, flexShrink: 0,
            }}>{member.name?.charAt(0).toUpperCase()}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: T.textPrimary, fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", letterSpacing: "-0.01em" }}>
                {member.name}
              </div>
              <div style={{ color: T.textMuted, fontSize: 10.5 }}>
                {ROLE_LABEL[member.role] || member.role}
              </div>
            </div>
            <button
              onClick={() => onNavigate("settings")}
              title="Ajustes"
              style={{
                display: "flex", background: "transparent", border: `1px solid ${T.textHint}`,
                color: T.textMuted, borderRadius: 8, padding: 6, cursor: "pointer",
              }}
            ><Icon name="settings" size={14} /></button>
            <button
              onClick={onSignOut}
              title="Cerrar sesión"
              style={{
                display: "flex", background: "transparent", border: `1px solid ${T.textHint}`,
                color: T.textMuted, borderRadius: 8, padding: 6, cursor: "pointer",
              }}
            ><Icon name="exit" size={14} /></button>
          </div>
        )}
      </div>
    </aside>
  );
}

// ───────── Sección "Más" (items fuera del nav principal, colapsable) ─────────
function MoreSection({ items, currentView, onNavigate, T }) {
  const [open, setOpen] = useState(items.some((it) => it.key === currentView));
  return (
    <div style={{ marginBottom: 10 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 8,
          padding: "4px 18px 6px", background: "transparent", border: "none",
          color: T.textMuted, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.02em",
          fontFamily: T.font, cursor: "pointer", textAlign: "left",
        }}
      >
        <span style={{ flex: 1 }}>Más</span>
        <span style={{ display: "flex", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
          <Icon name="chevron" size={13} />
        </span>
      </button>
      {open && items.map((it) => (
        <NavItem
          key={it.key}
          active={currentView === it.key}
          onClick={() => onNavigate(it.key)}
          icon={it.icon}
          label={it.label}
          T={T}
        />
      ))}
    </div>
  );
}

function SpaceGroup({ group, childrenOf, currentSpaceId, currentView, onSelectSpace, onCreateSpace, onEditSpace, onArchiveSpace, onDeleteSpace, T, defaultExpanded = true }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const accent = group.ownerColor || T.blue;
  const ids = group.roots.map((s) => s.id);

  return (
    <div style={{ marginBottom: 4 }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: "100%",
          display: "flex", alignItems: "center", gap: 8,
          padding: "5px 18px 5px 16px",
          background: "transparent", border: "none",
          color: T.textSecondary,
          fontSize: 12, fontWeight: 600,
          letterSpacing: "-0.01em",
          fontFamily: T.font,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span style={{ display: "flex", color: T.textMuted, width: 12, transform: expanded ? "none" : "rotate(-90deg)", transition: "transform 0.15s" }}>
          <Icon name="chevron" size={12} />
        </span>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: accent, flexShrink: 0 }} />
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {group.label}
        </span>
        <span style={{ color: T.textMuted, fontSize: 10.5 }}>{group.roots.length}</span>
      </button>
      {expanded && (
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {group.roots.map((s) => (
            <SortableSpaceItem
              key={s.id}
              space={s}
              childrenOf={childrenOf}
              currentSpaceId={currentSpaceId}
              currentView={currentView}
              onSelectSpace={onSelectSpace}
              onCreateSpace={onCreateSpace}
              onEditSpace={onEditSpace}
              onArchiveSpace={onArchiveSpace}
              onDeleteSpace={onDeleteSpace}
              T={T}
            />
          ))}
          <GroupDropZone groupKey={group.key} empty={group.roots.length === 0} T={T} />
        </SortableContext>
      )}
    </div>
  );
}

function SortableSpaceItem({ space, childrenOf, currentSpaceId, currentView, onSelectSpace, onCreateSpace, onEditSpace, onArchiveSpace, onDeleteSpace, T }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: space.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <SpaceTreeItem
        space={space}
        children={childrenOf(space.id)}
        currentSpaceId={currentSpaceId}
        currentView={currentView}
        onSelectSpace={onSelectSpace}
        onCreateSpace={onCreateSpace}
        onEditSpace={onEditSpace}
        onArchiveSpace={onArchiveSpace}
        onDeleteSpace={onDeleteSpace}
        T={T}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

function GroupDropZone({ groupKey, empty, T }) {
  const { setNodeRef, isOver } = useDroppable({ id: `groupzone-${groupKey}` });
  return (
    <div
      ref={setNodeRef}
      style={{
        margin: "2px 14px 4px",
        padding: empty ? "8px 10px" : "4px 10px",
        minHeight: empty ? 32 : 10,
        border: isOver ? `1px dashed ${T.sel}` : (empty ? T.borderDash : "1px dashed transparent"),
        borderRadius: 8,
        color: T.textMuted,
        fontSize: 10.5,
        fontStyle: empty ? "italic" : "normal",
        transition: "border-color 0.15s",
      }}
    >
      {empty ? "sin espacios — arrastra aquí" : ""}
    </div>
  );
}

function SpaceTreeItem({ space, children, currentSpaceId, currentView, onSelectSpace, onCreateSpace, onEditSpace, onArchiveSpace, onDeleteSpace, T, dragHandleProps }) {
  const [expanded, setExpanded] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const hasChildren = children.length > 0;
  const isActive = currentView === "space" && currentSpaceId === space.id;
  const isPrivate = space.visibility === "private";

  return (
    <div>
      {/* Parent row */}
      <div
        style={{
          display: "flex", alignItems: "center", gap: 4,
          padding: "6px 18px 6px 6px",
          background: isActive ? `${T.sel}1F` : "transparent",
          borderLeft: isActive ? `2px solid ${space.color || T.sel}` : "2px solid transparent",
        }}
      >
        {dragHandleProps && (
          <span
            {...dragHandleProps}
            title="Arrastrar para mover"
            style={{
              color: T.textMuted, cursor: "grab", fontSize: 10, padding: "0 2px",
              lineHeight: 1, userSelect: "none", touchAction: "none",
            }}
          >⋮⋮</span>
        )}
        {hasChildren ? (
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              display: "flex", background: "transparent", border: "none", color: T.textMuted,
              cursor: "pointer", width: 14, padding: 0,
              transform: expanded ? "none" : "rotate(-90deg)", transition: "transform 0.15s",
            }}
          ><Icon name="chevron" size={11} /></button>
        ) : (
          <span style={{ width: 14 }} />
        )}
        <button
          onClick={() => onSelectSpace(space.id)}
          style={{
            flex: 1, display: "flex", alignItems: "center", gap: 8,
            background: "transparent", border: "none", padding: "2px 0",
            color: isActive ? T.textPrimary : (isPrivate ? T.textMuted : T.textSecondary),
            fontSize: 13, fontWeight: isActive ? 600 : 500, fontFamily: T.font,
            cursor: "pointer", textAlign: "left", minWidth: 0,
          }}
        >
          <span style={{ fontSize: 13, flexShrink: 0 }}>{space.icon || (expanded && hasChildren ? "📂" : "📁")}</span>
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {space.name}
          </span>
          {isPrivate && <span style={{ display: "flex", color: T.textMuted }}><Icon name="lock" size={11} /></span>}
        </button>

        {/* Actions: + (add subspace) and ... (menu) */}
        <div ref={menuRef} style={{ position: "relative", display: "flex", gap: 2 }}>
          {onCreateSpace && (
            <button
              onClick={() => onCreateSpace(space.id)}
              title="Crear subespacio"
              style={{
                display: "flex", background: "transparent", border: "none", color: T.textMuted,
                cursor: "pointer", padding: "0 4px", lineHeight: 1,
              }}
            ><Icon name="plus" size={13} /></button>
          )}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            title="Opciones"
            style={{
              display: "flex", background: "transparent", border: "none", color: T.textMuted,
              cursor: "pointer", padding: "0 3px", lineHeight: 1,
            }}
          ><Icon name="dots" size={14} /></button>
          {menuOpen && (
            <div style={{
              position: "absolute", top: "100%", right: 0, marginTop: 4,
              background: T.bgSide, border: T.border, borderRadius: 10,
              padding: "6px", zIndex: 100, minWidth: 150,
              boxShadow: "var(--shadow-lg)",
            }}>
              <MenuItem label="Editar" icon="edit" onClick={() => { setMenuOpen(false); onEditSpace?.(space); }} T={T} />
              {onCreateSpace && (
                <MenuItem label="Crear subespacio" icon="folder" onClick={() => { setMenuOpen(false); onCreateSpace(space.id); }} T={T} />
              )}
              <MenuItem label="Archivar" icon="archive" onClick={() => { setMenuOpen(false); onArchiveSpace?.(space.id); }} T={T} />
              <MenuItem label="Eliminar" icon="trash" onClick={() => { setMenuOpen(false); onDeleteSpace?.(space.id); }} T={T} danger />
            </div>
          )}
        </div>
      </div>

      {/* Children (subespacios) — Notion-style con línea conectora */}
      {expanded && children.length > 0 && (
        <div
          style={{
            marginLeft: 22,
            borderLeft: `1px solid ${T.border.split("solid ")[1] || "rgba(180,200,225,0.11)"}`,
            paddingLeft: 4,
            marginTop: 2,
            marginBottom: 4,
          }}
        >
          <SortableContext items={children.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            {children.map((child) => (
              <SortableChildItem
                key={child.id}
                child={child}
                currentSpaceId={currentSpaceId}
                currentView={currentView}
                onSelectSpace={onSelectSpace}
                onEditSpace={onEditSpace}
                onDeleteSpace={onDeleteSpace}
                T={T}
              />
            ))}
          </SortableContext>
        </div>
      )}
    </div>
  );
}

function SortableChildItem({ child, currentSpaceId, currentView, onSelectSpace, onEditSpace, onDeleteSpace, T }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: child.id });
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  const childActive = currentView === "space" && currentSpaceId === child.id;
  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        display: "flex", alignItems: "center", gap: 4,
        margin: "1px 8px 1px 0",
        padding: "3px 4px",
        borderRadius: 6,
        background: childActive ? `${T.sel}1F` : "transparent",
      }}
    >
      <span
        {...attributes}
        {...listeners}
        title="Arrastrar"
        style={{
          color: T.textMuted, cursor: "grab", fontSize: 9, padding: "0 2px",
          lineHeight: 1, userSelect: "none", touchAction: "none",
        }}
      >⋮⋮</span>
      <button
        onClick={() => onSelectSpace(child.id)}
        style={{
          flex: 1, display: "flex", alignItems: "center", gap: 8,
          background: "transparent", border: "none", padding: "2px 0",
          color: childActive ? T.textPrimary : T.textSecondary,
          fontSize: 12.5, fontWeight: childActive ? 600 : 500, fontFamily: T.font,
          cursor: "pointer", textAlign: "left", minWidth: 0,
        }}
      >
        <ChecklistIcon color={childActive ? T.textPrimary : T.textMuted} />
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {child.name}
        </span>
      </button>
      <div ref={menuRef} style={{ position: "relative", display: "flex" }}>
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          title="Opciones"
          style={{
            display: "flex", background: "transparent", border: "none", color: T.textMuted,
            cursor: "pointer", padding: "0 4px", opacity: 0.6,
          }}
        ><Icon name="dots" size={12} /></button>
        {menuOpen && (
          <div style={{
            position: "absolute", top: "100%", right: 0, marginTop: 4,
            background: T.bgSide, border: T.border, borderRadius: 10,
            padding: "6px", zIndex: 100, minWidth: 150,
            boxShadow: "var(--shadow-lg)",
          }}>
            <MenuItem label="Editar" icon="edit" onClick={() => { setMenuOpen(false); onEditSpace?.(child); }} T={T} />
            <MenuItem label="Eliminar" icon="trash" onClick={() => { setMenuOpen(false); onDeleteSpace?.(child.id); }} T={T} danger />
          </div>
        )}
      </div>
    </div>
  );
}

function ChecklistIcon({ color }) {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
      <path d="M2 4l1.3 1.3L6 2.7" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="8" y1="4" x2="14" y2="4" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M2 10l1.3 1.3L6 8.7" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="8" y1="10" x2="14" y2="10" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function MenuItem({ label, icon, onClick, T, danger }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "8px 10px", textAlign: "left",
        background: "transparent", border: "none", cursor: "pointer", borderRadius: 8,
        fontSize: 12.5, fontFamily: T.font,
        color: danger ? T.red : T.textSecondary,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--hover)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      {icon && <span style={{ display: "flex" }}><Icon name={icon} size={14} /></span>}
      <span>{label}</span>
    </button>
  );
}

function NavSection({ label, children, T }) {
  const t = T || DS;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: t.textMuted, letterSpacing: "0.02em", padding: "0 18px 6px" }}>{label}</div>
      {children}
    </div>
  );
}

function NavItem({ active, onClick, icon, label, T, tuZona }) {
  const t = T || DS;
  return (
    <button
      onClick={onClick}
      className="nav-item"
      style={{
        width: "calc(100% - 20px)", margin: "0 10px", display: "flex", alignItems: "center", gap: 11,
        padding: "9px 12px", borderRadius: 11,
        background: active ? `${t.sel}1A` : "transparent",
        border: active ? `1px solid ${t.sel}59` : "1px solid transparent",
        color: active ? t.sel : t.textSecondary,
        cursor: "pointer", fontSize: 13, fontWeight: active ? 600 : 500, fontFamily: t.font,
        textAlign: "left", letterSpacing: "-0.01em", transition: "background 0.15s, color 0.15s",
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = t.textPrimary; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = t.textSecondary; }}
    >
      <span style={{ display: "flex", flexShrink: 0 }}><Icon name={icon} size={15} /></span>
      <span style={{ flex: 1 }}>{label}</span>
      {tuZona && (
        <span style={{
          fontSize: 9.5, fontWeight: 700, letterSpacing: "0.02em",
          background: `${t.purple}26`, color: t.purple,
          padding: "2px 7px", borderRadius: 999, lineHeight: 1.2, flexShrink: 0,
        }}>
          Tu zona
        </span>
      )}
    </button>
  );
}

// ───────── Iconos SVG de trazo (CLAUDE.md §5 — cero emoji en el nav) ─────────
const ICON_PATHS = {
  warroom: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />,
  planimpl: <><rect x="5" y="4.5" width="14" height="16" rx="2.5" /><path d="M9 4.5V3.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" /><path d="M8.5 11l1.7 1.7 3.3-3.3M8.5 16h5" /></>,
  agenda: <><rect x="3" y="4.5" width="18" height="16" rx="2.5" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4" /></>,
  rutina: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  contenido: <><rect x="3" y="4.5" width="18" height="15" rx="2.5" /><path d="M10 9l5 3-5 3z" /></>,
  pipeline: <><rect x="3" y="4.5" width="5" height="15" rx="1.5" /><rect x="9.5" y="4.5" width="5" height="10" rx="1.5" /><rect x="16" y="4.5" width="5" height="13" rx="1.5" /></>,
  empresas: <><path d="M4 21V6l7-3v18M20 21V10l-9-4" /><path d="M8 9h.01M8 13h.01M8 17h.01M3 21h18" /></>,
  banco: <><path d="M12 3 2 8l10 5 10-5-10-5Z" /><path d="M2 12.5l10 5 10-5M2 16.5l10 5 10-5" /></>,
  bandeja: <><path d="M5.5 5h13l3.5 7v7H2v-7l3.5-7Z" /><path d="M2 12h6l2 3h4l2-3h6" /></>,
  equipo: <><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M16 5.3a3 3 0 0 1 0 5.4M17.5 14c2.3.6 3.5 2.6 3.5 6" /></>,
  guiones: <><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17l-1 3Z" /><path d="M14.5 6.5l3 3" /></>,
  tiempo: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v5l3.5 2" /></>,
  tracking: <><circle cx="12" cy="12" r="2.4" /><path d="M7.5 7.5a6.5 6.5 0 0 0 0 9M16.5 7.5a6.5 6.5 0 0 1 0 9M4.5 4.5a10.5 10.5 0 0 0 0 15M19.5 4.5a10.5 10.5 0 0 1 0 15" /></>,
  northstar: <path d="M12 3l2.6 6.1 6.4.5-4.9 4.2 1.5 6.2L12 16.8 6.4 20.2l1.5-6.2L3 9.6l6.4-.5L12 3Z" />,
  finance: <><rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M3 10.5h18M16.5 14.5h1.5" /></>,
  feedback: <path d="M4 5h16v11H9l-4.5 3.5V5Z" />,
  trash: <><path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 12.5h9L17.5 7" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M4.3 4.3l2.1 2.1M17.6 17.6l2.1 2.1M2.5 12h3M18.5 12h3M4.3 19.7l2.1-2.1M17.6 6.4l2.1-2.1" /></>,
  exit: <><path d="M9.5 21H5.5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 16.5l5-4.5-5-4.5M21 12H9.5" /></>,
  sun: <><circle cx="12" cy="12" r="4.2" /><path d="M12 2v2.4M12 19.6V22M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2 12h2.4M19.6 12H22M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7" /></>,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />,
  play: <><circle cx="12" cy="12" r="9" /><path d="M10 8.3l6 3.7-6 3.7z" /></>,
  chevron: <path d="M6 9.5l6 6 6-6" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  dots: <><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></>,
  lock: <><rect x="4.5" y="10.5" width="15" height="10" rx="2" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" /></>,
  edit: <><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17l-1 3Z" /><path d="M14.5 6.5l3 3" /></>,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />,
  archive: <><rect x="3" y="4" width="18" height="4.5" rx="1.5" /><path d="M5 8.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V8.5M10 12.5h4" /></>,
};

function Icon({ name, size = 15 }) {
  const p = ICON_PATHS[name];
  if (!p) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      {p}
    </svg>
  );
}
