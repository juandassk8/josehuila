import { useState, useMemo, useEffect } from "react";
import { Topbar } from "../layout/Topbar.jsx";
import { TasksBoard } from "./TasksBoard.jsx";
import { TaskModal } from "./TaskModal.jsx";
import { FilterToggleButton, FilterPanel } from "./FilterBar.jsx";
import { useTaskFilters } from "../hooks/useTaskFilters.js";
import { applyTaskFilters, defaultHoyAyer, newRule } from "./taskFilters.js";
import { DS } from "../../lib/design.js";

export function AllTasks({ tasks, members, spaces, companies, currentMember, initialMemberFilter }) {
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  const filters = useTaskFilters({
    storageKey: "alltasks",
    defaultState: defaultHoyAyer(),
  });

  // Al entrar con initialMemberFilter (desde el workspace de un miembro), inyectar regla de assignee.
  useEffect(() => {
    if (!initialMemberFilter) return;
    const hasAssignee = filters.state.rules.some((r) => r.field === "assignee");
    if (!hasAssignee) {
      filters.addRule({ ...newRule("assignee"), operator: "is", value: [initialMemberFilter] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMemberFilter]);

  const filteredTasks = useMemo(
    () => applyTaskFilters(tasks, filters.state),
    [tasks, filters.state]
  );

  return (
    <div>
      <Topbar
        title="Todas las tareas"
        subtitle={`${filteredTasks.length} visible${filteredTasks.length === 1 ? "" : "s"}`}
      />

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
        onOpenTask={setEditing}
        onCreate={() => setCreating(true)}
        title="Operations board global"
        emptyHint="Aún no hay tareas creadas."
        extraActions={
          <FilterToggleButton
            state={filters.state}
            open={filterOpen}
            onToggle={() => setFilterOpen((v) => !v)}
          />
        }
      />
      {(editing || creating) && (
        <TaskModal
          task={editing}
          members={members}
          spaces={spaces}
          companies={companies}
          currentMember={currentMember}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={() => { setEditing(null); setCreating(false); }}
        />
      )}
    </div>
  );
}
