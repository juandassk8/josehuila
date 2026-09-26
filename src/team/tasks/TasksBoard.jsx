import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  useDroppable,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DS, STATUS_LABEL } from "../../lib/design.js";
import { TaskCard } from "./TaskCard.jsx";
import { setTaskStatus, updateTask } from "../data/db.js";

const COLUMNS = [
  { status: "pendiente",  accent: DS.blue,  emoji: "📋" },
  { status: "en_curso",   accent: DS.amber, emoji: "⚡" },
  { status: "completado", accent: DS.green, emoji: "✓" },
];

const COLUMN_STATUSES = COLUMNS.map((c) => c.status);

export function TasksBoard({
  tasks,
  members,
  spaces,
  companies,
  currentMember,
  onOpenTask,
  onCreate,
  title,
  subtitle,
  emptyHint,
  extraActions,
}) {
  const [activeId, setActiveId] = useState(null);
  // Optimistic overrides: { [taskId]: { status } } aplicados hasta confirmación.
  const [overrides, setOverrides] = useState({});
  // Memoizar las options del sensor — el objeto literal inline crea una
  // nueva referencia cada render y rompe el measurement interno de dnd-kit
  // (React #185 en producción).
  const pointerOptions = useMemo(() => ({ activationConstraint: { distance: 5 } }), []);
  const sensors = useSensors(useSensor(PointerSensor, pointerOptions));

  // Cuando realtime confirma el cambio, soltamos el override.
  // IMPORTANTE: sólo comparamos status y sort_order. completed_at es timestamp
  // y el del cliente (new Date()) nunca matchea al del server byte por byte —
  // si lo comparamos, el override quedaba STUCK para siempre, y al próximo drag
  // se mezclaba con el nuevo movimiento generando comportamiento errático
  // (cards "yendo y volviendo", titileo entre columnas).
  useEffect(() => {
    setOverrides((prev) => {
      let changed = false;
      const next = {};
      for (const [id, override] of Object.entries(prev)) {
        const real = (tasks || []).find((t) => t.id === id);
        if (!real) { changed = true; continue; }
        const statusMatch =
          override.status === undefined || override.status === real.status;
        const overrideSort = override.sort_order;
        const sortMatch =
          overrideSort === undefined || overrideSort === (real.sort_order || 0);
        if (statusMatch && sortMatch) { changed = true; continue; }
        next[id] = override;
      }
      return changed ? next : prev;
    });
  }, [tasks]);

  const effectiveTasks = useMemo(
    () =>
      (tasks || []).map((t) =>
        overrides[t.id] ? { ...t, ...overrides[t.id] } : t
      ),
    [tasks, overrides]
  );

  const grouped = useMemo(() => {
    const result = { pendiente: [], en_curso: [], completado: [] };
    effectiveTasks.forEach((t) => {
      if (result[t.status]) result[t.status].push(t);
    });
    // Ordenar cada columna por sort_order (asc) y luego created_at (desc) como fallback
    Object.keys(result).forEach((k) => {
      result[k].sort((a, b) => {
        const so = (a.sort_order || 0) - (b.sort_order || 0);
        if (so !== 0) return so;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    });
    return result;
  }, [effectiveTasks]);

  const activeTask = activeId ? effectiveTasks.find((t) => t.id === activeId) : null;

  // Encuentra la columna (status) de un id — id puede ser task.id o column.status
  const findContainer = (id) => {
    if (COLUMN_STATUSES.includes(id)) return id;
    const t = effectiveTasks.find((x) => x.id === id);
    return t?.status || null;
  };

  // Mueve el card entre columnas visualmente durante el drag.
  const handleDragOver = (event) => {
    const { active, over } = event;
    if (!over) return;
    const activeContainer = findContainer(active.id);
    const overContainer = findContainer(over.id);
    if (!activeContainer || !overContainer || activeContainer === overContainer) return;

    setOverrides((prev) => ({
      ...prev,
      [active.id]: {
        ...(prev[active.id] || {}),
        status: overContainer,
        completed_at: overContainer === "completado" ? new Date().toISOString() : null,
      },
    }));
  };

  const handleDragEnd = (event) => {
    setActiveId(null);
    const { active, over } = event;

    const task = effectiveTasks.find((t) => t.id === active.id);
    if (!task) return;

    const originalStatus = (tasks || []).find((t) => t.id === active.id)?.status;
    // Prioridad de columna destino:
    //  1) override (donde handleDragOver puso la tarjeta visualmente durante el drag)
    //  2) over.id (a qué columna/card cae el cursor al soltar)
    //  3) originalStatus
    // Por qué: con closestCorners, soltar cerca del borde entre en_curso y completado
    // a veces hace que over.id apunte a una card de la columna original — sin esto, el
    // status no cambiaba y la tarjeta quedaba stuck con override sin persistir.
    const overrideStatus = overrides[active.id]?.status;
    const overContainer = over ? findContainer(over.id) : null;
    const targetContainer = overrideStatus || overContainer || originalStatus;
    if (!targetContainer) return;
    const statusChanged = targetContainer !== originalStatus;

    // Calcular el orden final dentro de la columna destino.
    const columnItems = grouped[targetContainer].filter((t) => t.id !== active.id);
    let insertIdx;
    if (!over || over.id === targetContainer) {
      insertIdx = columnItems.length;
    } else {
      insertIdx = columnItems.findIndex((t) => t.id === over.id);
      if (insertIdx < 0) insertIdx = columnItems.length;
    }
    columnItems.splice(insertIdx, 0, { ...task, status: targetContainer });

    const needReorder = !over || over.id !== targetContainer;

    // Orden barato: si los vecinos tienen hueco entre sus sort_order, basta con darle a la
    // tarjeta movida un valor intermedio (1 escritura). Renumerar la columna entera eran
    // 300+ PATCH de golpe en "Completado" y llegó a tumbar la API. Solo se renumera si hay
    // empates entre vecinos, y entonces en tandas pequeñas.
    const prevSort = insertIdx > 0 ? columnItems[insertIdx - 1].sort_order || 0 : null;
    const nextSort = insertIdx < columnItems.length - 1 ? columnItems[insertIdx + 1].sort_order || 0 : null;
    let singleSort = null;
    if (prevSort == null && nextSort == null) singleSort = 1000;
    else if (prevSort == null) singleSort = nextSort - 1000;
    else if (nextSort == null) singleSort = prevSort + 1000;
    else if (nextSort - prevSort > 0.001) singleSort = (prevSort + nextSort) / 2;

    // OPTIMISTIC: aplicamos status + sort_order a los overrides AHORA — así
    // la UI refleja el cambio al instante, sin esperar al servidor.
    setOverrides((prev) => {
      const next = { ...prev };
      columnItems.forEach((it, idx) => {
        if (singleSort != null && it.id !== active.id) return;
        const newSort = singleSort != null ? singleSort : (idx + 1) * 1000;
        const patch = {};
        if (it.status !== targetContainer) patch.status = targetContainer;
        if ((it.sort_order || 0) !== newSort) patch.sort_order = newSort;
        if (targetContainer === "completado" && !it.completed_at) {
          patch.completed_at = new Date().toISOString();
        } else if (targetContainer !== "completado" && it.completed_at) {
          patch.completed_at = null;
        }
        if (Object.keys(patch).length > 0) {
          next[it.id] = { ...(next[it.id] || {}), ...patch };
        }
      });
      // El task que movió también tiene status override aplicado.
      if (statusChanged) {
        next[active.id] = {
          ...(next[active.id] || {}),
          status: targetContainer,
          completed_at: targetContainer === "completado" ? new Date().toISOString() : null,
        };
      }
      return next;
    });

    // Persistir en BACKGROUND — no bloquea el re-render.
    (async () => {
      if (statusChanged) {
        const { error } = await setTaskStatus(active.id, targetContainer, currentMember?.id);
        if (error) {
          setOverrides((prev) => { const n = { ...prev }; delete n[active.id]; return n; });
          return;
        }
      }
      if (needReorder && singleSort != null) {
        await updateTask(active.id, { sort_order: singleSort });
      } else if (needReorder) {
        const pending = columnItems
          .map((it, idx) => ({ id: it.id, from: it.sort_order || 0, to: (idx + 1) * 1000 }))
          .filter((x) => x.from !== x.to);
        for (let i = 0; i < pending.length; i += 6) {
          await Promise.all(pending.slice(i, i + 6).map((x) => updateTask(x.id, { sort_order: x.to })));
        }
      }
    })();
  };

  return (
    <div style={{ fontFamily: DS.font }}>
      {(title || onCreate || extraActions) && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 18,
            gap: 12,
          }}
        >
          <div>
            {title && (
              <div style={{ fontSize: 17, fontWeight: 700, color: DS.textPrimary, letterSpacing: "-0.01em" }}>
                {title}
              </div>
            )}
            {subtitle && (
              <div style={{ fontSize: 11, color: DS.textMuted, marginTop: 3, letterSpacing: "0.06em" }}>
                {subtitle}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {extraActions}
            {onCreate && (
              <button
                onClick={onCreate}
                style={{
                  padding: "10px 18px",
                  borderRadius: 50,
                  border: "none",
                  background: DS.textPrimary,
                  color: DS.bg,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                + Nueva tarea
              </button>
            )}
          </div>
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
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 320px))",
            gap: 12,
            alignItems: "flex-start",
            justifyContent: "flex-start",
          }}
        >
          {COLUMNS.map((col) => (
            <Column
              key={col.status}
              column={col}
              tasks={grouped[col.status]}
              members={members}
              spaces={spaces}
              companies={companies}
              onOpenTask={onOpenTask}
              onCreate={onCreate}
              activeId={activeId}
              emptyHint={emptyHint}
            />
          ))}
        </div>

        <DragOverlay>
          {activeTask && (
            <div style={{ opacity: 0.95, transform: "rotate(1.5deg)" }}>
              <TaskCard task={activeTask} members={members} spaces={spaces} companies={companies} />
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function Column({ column, tasks, members, spaces, companies, onOpenTask, onCreate, activeId, emptyHint }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.status });
  return (
    <div
      ref={setNodeRef}
      style={{
        background: isOver ? "var(--hover)" : "transparent",
        border: `1px solid ${isOver ? column.accent + "44" : "transparent"}`,
        borderRadius: 14,
        padding: "4px 4px 8px",
        minHeight: 80,
        transition: "background 0.15s, border-color 0.15s",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "4px 6px 14px",
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: column.accent,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 13.5,
            fontWeight: 600,
            color: DS.textPrimary,
            letterSpacing: "-0.01em",
          }}
        >
          {STATUS_LABEL[column.status]}
        </span>
        <span style={{ fontSize: 12.5, color: DS.textMuted, fontWeight: 500 }}>{tasks.length}</span>
        <span style={{ flex: 1 }} />
        {onCreate && (
          <button
            onClick={onCreate}
            title="Nueva tarea"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "transparent", border: "none", color: DS.textMuted,
              cursor: "pointer", padding: 2, borderRadius: 6,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          </button>
        )}
      </div>

      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        {tasks.length === 0 ? (
          <button
            onClick={onCreate}
            style={{
              display: "block", width: "100%", textAlign: "left",
              color: DS.textMuted, fontSize: 12.5, padding: "10px 12px",
              background: "transparent", border: DS.borderDash, borderRadius: 12,
              cursor: "pointer", fontFamily: DS.font, letterSpacing: "-0.01em",
            }}
          >
            + Agregar tarea
          </button>
        ) : (
          tasks.map((task) => (
            <SortableTask
              key={task.id}
              task={task}
              members={members}
              spaces={spaces}
              companies={companies}
              onOpenTask={onOpenTask}
              isActive={activeId === task.id}
            />
          ))
        )}
      </SortableContext>
    </div>
  );
}

function SortableTask({ task, members, spaces, companies, onOpenTask, isActive }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <TaskCard
        task={task}
        members={members}
        spaces={spaces}
        companies={companies}
        onClick={onOpenTask}
        dragHandleProps={attributes}
        dragListeners={listeners}
        isDragging={isDragging || isActive}
      />
    </div>
  );
}
