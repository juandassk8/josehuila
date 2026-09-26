import { useMemo, useState } from "react";
import { ActivityFeed } from "./ActivityFeed.jsx";
import { TasksBoard } from "../tasks/TasksBoard.jsx";
import { TaskModal } from "../tasks/TaskModal.jsx";
import { FilterPanel } from "../tasks/FilterBar.jsx";
import { useTaskFilters } from "../hooks/useTaskFilters.js";
import { applyTaskFilters, presetMisTareas } from "../tasks/taskFilters.js";

export function OperationsBoard({ members, tasks, spaces, companies, currentMember, filterOpen = false, onNewTask }) {
  const [editingTask, setEditingTask] = useState(null);

  // Default: solo mis tareas (assignee = currentMember). El user puede abrir
  // el filter panel y cambiar a "Todas" para ver tareas del equipo.
  // Storage keyeado por miembro — cada uno tiene su propio estado.
  const defaultState = useMemo(
    () => (currentMember?.id ? presetMisTareas(currentMember.id) : { rules: [] }),
    [currentMember?.id]
  );
  const filters = useTaskFilters({
    storageKey: `warroom:${currentMember?.id || "anon"}`,
    defaultState,
  });

  const filteredTasks = useMemo(
    () => applyTaskFilters(tasks, filters.state),
    [tasks, filters.state]
  );

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 3fr) minmax(280px, 1fr)",
        gap: 18,
        alignItems: "start",
      }}
    >
      <div data-tour="tareas-summary">
        <FilterPanel
          {...filters}
          members={members}
          spaces={spaces}
          open={filterOpen}
        />
        <TasksBoard
          tasks={filteredTasks}
          members={members}
          spaces={spaces}
          companies={companies}
          currentMember={currentMember}
          onCreate={onNewTask}
          onOpenTask={(t) => setEditingTask(t)}
          emptyHint="Arrastra una tarea aquí"
        />
      </div>
      <div data-tour="actividad">
        <ActivityFeed tasks={tasks} members={members} />
      </div>

      {editingTask && (
        <TaskModal
          task={editingTask}
          members={members}
          spaces={spaces}
          companies={companies}
          currentMember={currentMember}
          onClose={() => setEditingTask(null)}
          onSaved={() => setEditingTask(null)}
        />
      )}
    </div>
  );
}
