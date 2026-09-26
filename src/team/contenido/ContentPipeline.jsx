import { useEffect, useMemo, useState } from "react";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors, closestCorners, useDroppable,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DS } from "../../lib/design.js";
import { ContentCard, CONTENT_STATUSES, CONTENT_STATUS_LABEL, COLUMN_BG, COLUMN_BORDER, ARCHIVED_STATUSES, TRIAL_STATUS } from "./ContentCard.jsx";
import { setContentStatus, createContentItem, updateContentItem, autoPromoteToTrial, setContentArchived } from "../data/contentDb.js";
import { Topbar } from "../layout/Topbar.jsx";
import { canCreateContent } from "../lib/permissions.js";
import { logger } from "../../lib/logger.js";

const STATUS_DOT_COLORS = {
  idea: "#9b9b9b",
  scripting: "#378ADD",
  to_film: "#E24B4A",
  to_edit: "#EC4899",
  to_post: "#E9C435",
  posted: "#1DB97A",
  trial: "#A78BFA",
  killed: "#6B7280",
  promoted: "#0EA5E9",
};

export function ContentPipeline({
  items,
  members,
  currentMember,
  onOpenItem,
  tagOptions,
  visibleStatuses,
  showTopbar = true,
  showKindFilter = true,
  extraTopbarActions,
  title = "Content Pipeline",
  subtitle,
  kindFilter: kindFilterProp,
  onKindFilterChange,
}) {
  const [activeId, setActiveId] = useState(null);
  const [overrides, setOverrides] = useState({});
  const [kindFilterState, setKindFilterState] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  // Toggle independiente del de Killed/Promoted: muestra items con el
  // flag manual `archived=true`. Default oculto.
  const [showHidden, setShowHidden] = useState(false);
  const kindFilter = kindFilterProp ?? kindFilterState;
  const setKindFilter = (v) => {
    if (onKindFilterChange) onKindFilterChange(v);
    else setKindFilterState(v);
  };
  // Memoizar las options del sensor — sin esto, dnd-kit recibe un sensors
  // array nuevo cada render y desestabiliza el measurement (React #185).
  const pointerOptions = useMemo(() => ({ activationConstraint: { distance: 3 } }), []);
  const sensors = useSensors(useSensor(PointerSensor, pointerOptions));
  const canCreate = canCreateContent(currentMember);

  // Auto-paso de posted → trial para videos con +72h en posted. Se ejecuta
  // una vez al montar; si la SQL no se corrió todavía falla silencioso y
  // no rompe el resto del board.
  useEffect(() => {
    autoPromoteToTrial().catch(() => {});
  }, []);

  // Trial visible solo cuando vemos "Todo" o "Videos" — no aplica a posts/historias.
  const showTrial = kindFilter === "all" || kindFilter === "video";

  // Construir columnas dinámicamente:
  //   base pipeline + (Trial si aplica) + (archived si toggle on)
  const columns = useMemo(() => {
    if (visibleStatuses && visibleStatuses.length > 0) {
      return visibleStatuses.filter((s) =>
        CONTENT_STATUSES.includes(s) || s === TRIAL_STATUS || ARCHIVED_STATUSES.includes(s)
      );
    }
    const cols = [...CONTENT_STATUSES];
    if (showTrial) cols.push(TRIAL_STATUS);
    if (showArchived) cols.push(...ARCHIVED_STATUSES);
    return cols;
  }, [visibleStatuses, showTrial, showArchived]);

  useEffect(() => {
    setOverrides((prev) => {
      let changed = false;
      const next = {};
      for (const [id, o] of Object.entries(prev)) {
        const real = (items || []).find((t) => t.id === id);
        if (!real) { changed = true; continue; }
        const allMatch = Object.keys(o).every((k) => {
          const a = o[k], b = real[k];
          if (a == null && b == null) return true;
          return a === b;
        });
        if (allMatch) { changed = true; continue; }
        next[id] = o;
      }
      return changed ? next : prev;
    });
  }, [items]);

  const filtered = useMemo(() => {
    let list = (items || []).map((t) => overrides[t.id] ? { ...t, ...overrides[t.id] } : t);
    if (kindFilter !== "all") {
      list = list.filter((i) => i.kind === kindFilter);
    } else {
      // "Todo" excluye historias — viven solo en su tab Historias
      list = list.filter((i) => i.kind !== "story");
    }
    // Filtrar items archivados manualmente (flag `archived=true`) salvo
    // que el user toggleé "Archivadas (N)".
    if (!showHidden) list = list.filter((i) => !i.archived);
    return list;
  }, [items, overrides, kindFilter, showHidden]);

  // Conteo de items con flag manual archived — para el badge del toggle.
  const hiddenCount = useMemo(() => {
    let list = (items || []).map((t) => overrides[t.id] ? { ...t, ...overrides[t.id] } : t);
    if (kindFilter !== "all") list = list.filter((i) => i.kind === kindFilter);
    else list = list.filter((i) => i.kind !== "story");
    return list.filter((i) => !!i.archived).length;
  }, [items, overrides, kindFilter]);

  // Handler optimista de archivado/desarchivado. Aplica override local
  // primero para feedback instantáneo, luego persiste en background.
  const handleToggleArchive = (item, nextArchived) => {
    setOverrides((prev) => ({ ...prev, [item.id]: { ...(prev[item.id] || {}), archived: nextArchived } }));
    setContentArchived(item.id, nextArchived).catch((err) => {
      logger.error("[ContentPipeline] archive failed:", err);
      setOverrides((prev) => {
        const next = { ...prev };
        if (next[item.id]) {
          const { archived: _, ...rest } = next[item.id];
          if (Object.keys(rest).length) next[item.id] = rest;
          else delete next[item.id];
        }
        return next;
      });
    });
  };

  const grouped = useMemo(() => {
    const result = {};
    CONTENT_STATUSES.forEach((s) => { result[s] = []; });
    result[TRIAL_STATUS] = [];
    ARCHIVED_STATUSES.forEach((s) => { result[s] = []; });
    filtered.forEach((t) => { if (result[t.status]) result[t.status].push(t); });
    // Re-ordenar cada columna por sort_order para que el drop optimista se
    // refleje YA, sin esperar el refetch del realtime. Sort estable: los
    // empates conservan el orden de `filtered` (que viene de DB como
    // sort_order asc + created_at desc), así el render previo al refetch
    // coincide exacto con el posterior y la tarjeta no "salta" y vuelve.
    Object.keys(result).forEach((s) => {
      result[s].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    });
    return result;
  }, [filtered]);

  // Counts para el toggle de archivados
  const archivedCount = (grouped.killed?.length || 0) + (grouped.promoted?.length || 0);

  // Solo las columnas visibles se muestran. Items en status oculto no se ven
  // en este board pero siguen existiendo en DB.
  const visibleGrouped = useMemo(() => {
    const result = {};
    columns.forEach((s) => { result[s] = grouped[s] || []; });
    return result;
  }, [grouped, columns]);

  const activeItem = activeId ? filtered.find((t) => t.id === activeId) : null;

  // Encuentra la columna (status) de un id — id puede ser item.id o column status
  const findContainer = (id) => {
    if (columns.includes(id)) return id;
    const it = filtered.find((x) => x.id === id);
    return it?.status || null;
  };

  // Mueve el card entre columnas visualmente durante el drag (feedback fluido).
  const handleDragOver = (event) => {
    const { active, over } = event;
    if (!over) return;
    const activeContainer = findContainer(active.id);
    const overContainer = findContainer(over.id);
    if (!activeContainer || !overContainer || activeContainer === overContainer) return;
    setOverrides((prev) => ({
      ...prev,
      [active.id]: { ...(prev[active.id] || {}), status: overContainer },
    }));
  };

  const handleDragEnd = (event) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const originalItem = (items || []).find((t) => t.id === active.id);
    if (!originalItem) return;
    const originalStatus = originalItem.status;

    // Determinar columna destino
    let newStatus = over.id;
    let targetIndex = -1;
    if (!columns.includes(newStatus)) {
      const overItem = filtered.find((t) => t.id === over.id);
      if (!overItem) return;
      newStatus = overItem.status;
      targetIndex = (grouped[newStatus] || []).findIndex((t) => t.id === over.id);
    }

    if (originalStatus === newStatus && targetIndex === -1) return;

    // Calcular el orden final de la columna destino.
    const columnItems = [...grouped[newStatus]].filter((t) => t.id !== active.id);
    const insertIdx = targetIndex >= 0 ? targetIndex : columnItems.length;
    columnItems.splice(insertIdx, 0, { ...originalItem, status: newStatus });

    const statusChanged = originalStatus !== newStatus;
    const needReorder = targetIndex >= 0;

    // OPTIMISTIC: aplicamos status + sort_order a los overrides AHORA.
    setOverrides((prev) => {
      const next = { ...prev };
      columnItems.forEach((it, idx) => {
        const newSort = (idx + 1) * 1000;
        const patch = {};
        if (it.status !== newStatus) patch.status = newStatus;
        if ((it.sort_order || 0) !== newSort) patch.sort_order = newSort;
        if (Object.keys(patch).length > 0) {
          next[it.id] = { ...(next[it.id] || {}), ...patch };
        }
      });
      if (statusChanged) {
        next[active.id] = { ...(next[active.id] || {}), status: newStatus };
      }
      return next;
    });

    // Persistir en BACKGROUND.
    (async () => {
      if (statusChanged) {
        const { error } = await setContentStatus(active.id, newStatus);
        if (error) {
          setOverrides((prev) => { const n = { ...prev }; delete n[active.id]; return n; });
          return;
        }
      }
      if (needReorder) {
        // En tandas pequeñas: renumerar una columna grande de golpe satura la API (incidente 2026-09-18).
        const pending = columnItems
          .map((it, idx) => ({ id: it.id, from: it.sort_order || 0, to: (idx + 1) * 1000 }))
          .filter((x) => x.from !== x.to);
        for (let i = 0; i < pending.length; i += 6) {
          await Promise.all(pending.slice(i, i + 6).map((x) => updateContentItem(x.id, { sort_order: x.to })));
        }
      }
    })();
  };

  const handleNewInColumn = async (status) => {
    const { data } = await createContentItem({
      title: "Sin título",
      kind: kindFilter !== "all" ? kindFilter : "video",
      status,
      created_by: currentMember?.id,
    });
    if (data) onOpenItem?.(data);
  };

  const topbarActions = (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      {extraTopbarActions}
      {canCreate && (
        <button
          onClick={async () => {
            const { data } = await createContentItem({
              title: "Sin título",
              kind: kindFilter !== "all" ? kindFilter : "video",
              status: columns[0] || "idea",
              created_by: currentMember?.id,
            });
            if (data) onOpenItem?.(data);
          }}
          style={{
            padding: "10px 18px", borderRadius: 8, border: DS.border,
            background: DS.bgCard, color: DS.textPrimary, fontSize: 13, fontWeight: 600,
            cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
          }}
        >
          + Nuevo contenido
        </button>
      )}
    </div>
  );

  return (
    <div style={{ fontFamily: DS.font }}>
      {showTopbar && (
        <Topbar
          title={title}
          subtitle={subtitle ?? `${filtered.length} items · @josehuilaa`}
          accent={DS.purple}
          actions={topbarActions}
        />
      )}
      {!showTopbar && extraTopbarActions && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
          {extraTopbarActions}
        </div>
      )}

      {showKindFilter && (
        <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
          {[
            { value: "all", label: "Todo" },
            { value: "video", label: "Videos" },
            { value: "story", label: "Historias" },
            { value: "post", label: "Posts" },
          ].map((f) => (
            <button key={f.value} onClick={() => setKindFilter(f.value)}
              style={{
                padding: "6px 14px", borderRadius: 50, cursor: "pointer",
                border: `1px solid ${kindFilter === f.value ? DS.textMuted : DS.textHint}`,
                background: kindFilter === f.value ? DS.bgCard : "transparent",
                color: kindFilter === f.value ? DS.textPrimary : DS.textSecondary,
                fontSize: 12, fontWeight: 600,
              }}>
              {f.label}
            </button>
          ))}
          <span style={{ flex: 1 }} />
          {/* Toggle items archivados manualmente (flag archived=true).
              Independiente del toggle de Killed/Promoted que vive abajo. */}
          {(showHidden || hiddenCount > 0) && (
            <button
              onClick={() => setShowHidden((v) => !v)}
              title={showHidden ? "Ocultar archivadas" : "Ver archivadas"}
              style={{
                padding: "6px 14px", borderRadius: 50, cursor: "pointer",
                border: `1px solid ${showHidden ? DS.textMuted : DS.textHint}`,
                background: showHidden ? DS.bgCard : "transparent",
                color: showHidden ? DS.textPrimary : DS.textSecondary,
                fontSize: 11, fontWeight: 600, fontFamily: DS.font,
                display: "inline-flex", alignItems: "center", gap: 6,
              }}
            >
              <span>{showHidden ? "▾" : "▸"}</span>
              <span>📦 Archivadas</span>
              {hiddenCount > 0 && (
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 50,
                  background: "rgba(255,255,255,0.06)", color: DS.textMuted,
                  letterSpacing: "0.04em",
                }}>
                  {hiddenCount}
                </span>
              )}
            </button>
          )}
          {/* Toggle Killed/Promoted — estados terminales del pipeline.
              Distinto del flag manual de archivado de arriba. */}
          {(showArchived || archivedCount > 0) && (
            <button
              onClick={() => setShowArchived((v) => !v)}
              title={showArchived ? "Ocultar Killed/Promoted" : "Ver Killed/Promoted"}
              style={{
                padding: "6px 14px", borderRadius: 50, cursor: "pointer",
                border: `1px solid ${showArchived ? DS.textMuted : DS.textHint}`,
                background: showArchived ? DS.bgCard : "transparent",
                color: showArchived ? DS.textPrimary : DS.textSecondary,
                fontSize: 11, fontWeight: 600, fontFamily: DS.font,
                display: "inline-flex", alignItems: "center", gap: 6,
              }}
            >
              <span>{showArchived ? "▾" : "▸"}</span>
              <span>Killed / Promoted</span>
              {archivedCount > 0 && (
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 50,
                  background: "rgba(255,255,255,0.06)", color: DS.textMuted,
                  letterSpacing: "0.04em",
                }}>
                  {archivedCount}
                </span>
              )}
            </button>
          )}
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={(e) => setActiveId(e.active.id)}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        {/* Columnas con ancho FIJO (no 1fr) para que agregar Trial / Killed /
            Promoted no apriete el resto. El contenedor scrollea horizontal:
            con dos dedos en trackpad ves Trial/Killed/Promoted sin perder
            tamaño en las primeras columnas. */}
        <div style={{
          display: "grid",
          gridTemplateColumns: `repeat(${columns.length}, 240px)`,
          gap: 10, alignItems: "flex-start", overflowX: "auto", paddingBottom: 16,
          // Scroll suave con trackpad/wheel sin que el browser intente
          // overscroll bounce al final.
          overscrollBehaviorX: "contain",
          scrollbarGutter: "stable",
        }}>
          {columns.map((st) => (
            <PipelineColumn
              key={st}
              status={st}
              items={visibleGrouped[st] || []}
              members={members}
              tagOptions={tagOptions}
              onOpen={onOpenItem || (() => {})}
              onNewPage={canCreate ? () => handleNewInColumn(st) : null}
              onArchiveToggle={handleToggleArchive}
              activeId={activeId}
            />
          ))}
        </div>
        <DragOverlay>
          {activeItem && (
            <div style={{ opacity: 0.95, transform: "rotate(1.5deg)" }}>
              <ContentCard item={activeItem} members={members} tagOptions={tagOptions} />
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function PipelineColumn({ status, items, members, tagOptions, onOpen, onNewPage, onArchiveToggle, activeId }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const dotColor = STATUS_DOT_COLORS[status];
  const bg = COLUMN_BG[status] || DS.bgCard;
  const borderColor = COLUMN_BORDER[status] || DS.textHint;

  return (
    <div ref={setNodeRef} style={{
      background: isOver ? `${bg.replace(/[\d.]+\)$/, "0.12)")}` : bg,
      border: `1px solid ${isOver ? borderColor : borderColor}`,
      borderRadius: 10, padding: "10px 8px 8px", minHeight: 160,
      transition: "background 0.15s",
    }}>
      {/* Notion-style header: ● Label  count  ⋯  + */}
      <div style={{
        display: "flex", alignItems: "center", padding: "0 4px 10px", gap: 6,
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: "50%", background: dotColor, flexShrink: 0,
        }} />
        <span style={{
          fontSize: 12, fontWeight: 700, color: dotColor,
          flex: 1, letterSpacing: "0.02em",
        }}>
          {CONTENT_STATUS_LABEL[status]}
        </span>
        <span style={{
          fontSize: 11, color: DS.textMuted, fontWeight: 500,
        }}>
          {items.length}
        </span>
        {onNewPage && (
          <button onClick={onNewPage} title="Nuevo" style={{
            background: "transparent", border: "none", color: DS.textMuted,
            cursor: "pointer", fontSize: 14, padding: "0 2px", opacity: 0.6,
          }}>+</button>
        )}
      </div>

      {items.length === 0 ? (
        onNewPage ? (
          <button onClick={onNewPage} style={{
            width: "100%", textAlign: "left",
            padding: "8px 10px", borderRadius: 6,
            background: "transparent", border: DS.borderDash,
            color: DS.textMuted, fontSize: 12, cursor: "pointer",
            fontFamily: DS.font,
          }}>
            + New page
          </button>
        ) : (
          <div style={{
            padding: "8px 10px", fontSize: 12, color: DS.textMuted,
            textAlign: "center", fontStyle: "italic",
          }}>vacío</div>
        )
      ) : (
        <>
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            {items.map((item) => (
              <DraggableContent key={item.id} item={item} members={members} tagOptions={tagOptions} onOpen={onOpen} onArchiveToggle={onArchiveToggle} isActive={activeId === item.id} />
            ))}
          </SortableContext>
          {onNewPage && (
            <button onClick={onNewPage} style={{
              width: "100%", textAlign: "left",
              padding: "6px 10px", borderRadius: 6, marginTop: 4,
              background: "transparent", border: "none",
              color: dotColor, fontSize: 12, cursor: "pointer",
              fontFamily: DS.font, opacity: 0.7,
            }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.7"; }}
            >
              + New page
            </button>
          )}
        </>
      )}
    </div>
  );
}

function DraggableContent({ item, members, tagOptions, onOpen, onArchiveToggle, isActive }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <ContentCard item={item} members={members} tagOptions={tagOptions} onClick={onOpen} onArchiveToggle={onArchiveToggle} dragHandleProps={attributes} dragListeners={listeners} isDragging={isDragging || isActive} />
    </div>
  );
}
