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
import { setTaskStatus, updateTask } from "./workspace_tasks_db.js";

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
  hideHeader = false,
}) {
  const [activeId, setActiveId] = useState(null);
  // Optimistic overrides: { [taskId]: { status } } aplicados hasta confirmación.
  const [overrides, setOverrides] = useState({});
  // Memoizar las options del sensor — sin esto, dnd-kit recibe un sensors
  // array nuevo cada render y desestabiliza el measurement (React #185).
  const pointerOptions = useMemo(() => ({ activationConstraint: { distance: 5 } }), []);
  const sensors = useSensors(useSensor(PointerSensor, pointerOptions));

  // Cuando realtime confirma el cambio (status Y sort_order), soltamos el
  // override. Evita el "salto" visual al volver a la posición del DB.
  useEffect(() => {
    setOverrides((prev) => {
      let changed = false;
      const next = {};
      for (const [id, override] of Object.entries(prev)) {
        const real = (tasks || []).find((t) => t.id === id);
        if (!real) { changed = true; continue; }
        const allMatch = Object.keys(override).every((k) => {
          const a = override[k];
          const b = real[k];
          if (a == null && b == null) return true;
          return a === b;
        });
        if (allMatch) { changed = true; continue; }
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
    if (!over) return;

    const task = effectiveTasks.find((t) => t.id === active.id);
    if (!task) return;

    const targetContainer = findContainer(over.id);
    if (!targetContainer) return;

    const originalStatus = (tasks || []).find((t) => t.id === active.id)?.status;
    const statusChanged = targetContainer !== originalStatus;

    const columnItems = grouped[targetContainer].filter((t) => t.id !== active.id);
    let insertIdx;
    if (over.id === targetContainer) {
      insertIdx = columnItems.length;
    } else {
      insertIdx = columnItems.findIndex((t) => t.id === over.id);
      if (insertIdx < 0) insertIdx = columnItems.length;
    }
    columnItems.splice(insertIdx, 0, { ...task, status: targetContainer });

    const needReorder = over.id !== targetContainer;

    // OPTIMISTIC: aplicamos status + sort_order a los overrides AHORA — así
    // la UI refleja el cambio al instante, sin esperar al servidor.
    setOverrides((prev) => {
      const next = { ...prev };
      columnItems.forEach((it, idx) => {
        const newSort = (idx + 1) * 1000;
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
      if (needReorder) {
        // En tandas pequeñas: renumerar 300+ tareas de golpe llegó a tumbar la API.
        const pending = columnItems
          .map((it, idx) => ({ it, to: (idx + 1) * 1000 }))
          .filter((x) => (x.it.sort_order || 0) !== x.to);
        for (let i = 0; i < pending.length; i += 6) {
          await Promise.all(pending.slice(i, i + 6).map((x) => updateTask(x.it.id, { sort_order: x.to })));
        }
      }
    })();
  };

  return (
    <div style={{ fontFamily: DS.font }}>
      {!hideHeader && (title || onCreate || extraActions) && (
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
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 10,
            alignItems: "flex-start",
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
        border: `1px solid ${isOver ? column.accent + "44" : "var(--line)"}`,
        borderRadius: 14,
        padding: "4px 4px 8px",
        minHeight: 110,
        transition: "background 0.15s, border-color 0.15s",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 6px 12px",
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: column.accent, flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-2)", letterSpacing: "-0.01em" }}>
          {STATUS_LABEL[column.status]}
        </span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "var(--ink-4)", fontVariantNumeric: "tabular-nums" }}>{tasks.length}</span>
        <span style={{ flex: 1 }} />
        {onCreate && (
          <button onClick={onCreate} title="Agregar tarea" style={{
            display: "grid", placeItems: "center", width: 22, height: 22, borderRadius: 7,
            border: "none", background: "transparent", color: "var(--ink-3)", cursor: "pointer",
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          </button>
        )}
      </div>

      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        {tasks.length === 0 ? (
          <button
            onClick={onCreate}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              width: "100%", color: "var(--ink-4)", fontSize: 12, fontWeight: 600,
              padding: "12px 8px", background: "transparent", border: "1.5px dashed var(--line)",
              borderRadius: 12, cursor: "pointer", fontFamily: DS.font,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            Agregar tarea
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
