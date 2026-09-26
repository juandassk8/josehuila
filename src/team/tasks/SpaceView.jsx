import { useMemo, useState } from "react";
import { DS } from "../../lib/design.js";
import { Topbar } from "../layout/Topbar.jsx";
import { TasksBoard } from "./TasksBoard.jsx";
import { TasksList } from "./TasksList.jsx";
import { TaskModal } from "./TaskModal.jsx";
import { FilterToggleButton, FilterPanel } from "./FilterBar.jsx";
import { useTaskFilters } from "../hooks/useTaskFilters.js";
import { applyTaskFilters, defaultHoyAyer } from "./taskFilters.js";
import { usePathRoute } from "../../lib/router.jsx";

export function SpaceView({ space, tasks, members, spaces, companies, currentMember }) {
  // URL: #/space/<spaceId>/<view>   (view = list | board)
  const { segments, navigate } = usePathRoute({ prefix: "/equipo" });
  const validViews = ["list", "board"];
  const view = validViews.includes(segments[2]) ? segments[2] : "list";
  const setView = (v) => navigate(`/space/${space?.id}/${v}`);

  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [scope, setScope] = useState("mine"); // "mine" | "all" — default = solo mías
  const [filterOpen, setFilterOpen] = useState(false);
  const filters = useTaskFilters({
    storageKey: `space_${space?.id || "none"}`,
    defaultState: defaultHoyAyer(),
  });

  const isAdmin = currentMember?.role === "admin";
  // Incluir tareas del espacio actual Y de todos sus subespacios (descendientes).
  const descendantIds = (() => {
    if (!space?.id) return new Set();
    const result = new Set();
    const stack = [space.id];
    while (stack.length) {
      const id = stack.pop();
      result.add(id);
      (spaces || []).filter((s) => s.parent_space_id === id).forEach((s) => stack.push(s.id));
    }
    return result;
  })();
  const allSpaceTasks = (tasks || []).filter((t) => descendantIds.has(t.space_id));
  const scoped = scope === "mine"
    ? allSpaceTasks.filter((t) => (t.assigneeIds || []).includes(currentMember?.id))
    : allSpaceTasks;
  const spaceTasks = useMemo(
    () => applyTaskFilters(scoped, filters.state),
    [scoped, filters.state]
  );
  const subspaces = (spaces || []).filter((s) => s.parent_space_id === space?.id);

  if (!space) return null;

  return (
    <div>
      <Topbar
        title={`${space.icon || "📁"} ${space.name}`}
        subtitle={`${spaceTasks.length} tareas${subspaces.length > 0 ? ` · ${subspaces.length} subespacios` : ""} · ${space.visibility === "private" ? "privado" : "compartido"}`}
        accent={space.color}
      />

      {/* Subspaces navigation */}
      {subspaces.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: DS.textMuted, letterSpacing: "0.12em", marginBottom: 10 }}>
            SUBESPACIOS
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {subspaces.map((s) => (
              <div key={s.id} style={{
                padding: "8px 14px", borderRadius: 10, background: DS.bgCard, border: DS.border,
                fontSize: 12, color: DS.textPrimary, display: "flex", alignItems: "center", gap: 6,
              }}>
                <span>{s.icon || "📄"}</span>
                <span>{s.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* View toggle + scope + Nueva tarea en la misma fila */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 14,
        gap: 12,
        flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{
            display: "flex", gap: 2,
            background: DS.bgCard, borderRadius: 10, padding: 3,
            width: "fit-content", border: DS.border,
          }}>
            <ViewTab active={view === "list"} onClick={() => setView("list")} icon="📋" label="Lista" />
            <ViewTab active={view === "board"} onClick={() => setView("board")} icon="📊" label="Tablero" />
          </div>
          <div style={{
            display: "flex", gap: 2,
            background: DS.bgCard, borderRadius: 10, padding: 3,
            width: "fit-content", border: DS.border,
          }}>
            <ViewTab active={scope === "mine"} onClick={() => setScope("mine")} icon="👤" label="Mías" />
            <ViewTab active={scope === "all"} onClick={() => setScope("all")} icon="👥" label={isAdmin ? "Todas" : "Del equipo"} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <FilterToggleButton
            state={filters.state}
            open={filterOpen}
            onToggle={() => setFilterOpen((v) => !v)}
          />
          <button
            onClick={() => setCreating(true)}
            style={{
              padding: "8px 16px",
              borderRadius: 50,
              border: "none",
              background: DS.textPrimary,
              color: DS.bg,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: DS.font,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            + Nueva tarea
          </button>
        </div>
      </div>

      <FilterPanel
        {...filters}
        members={members}
        spaces={spaces}
        open={filterOpen}
      />

      {view === "list" ? (
        <TasksList
          tasks={spaceTasks}
          members={members}
          companies={companies}
          currentMember={currentMember}
          onOpenTask={setEditing}
          onCreate={null}
          emptyHint={`Aún no hay tareas en ${space.name}.`}
        />
      ) : (
        <TasksBoard
          tasks={spaceTasks}
          members={members}
          spaces={spaces}
          companies={companies}
          currentMember={currentMember}
          onOpenTask={setEditing}
          onCreate={null}
          emptyHint={`Aún no hay tareas en ${space.name}.`}
        />
      )}

      {(editing || creating) && (
        <TaskModal
          task={editing}
          members={members}
          spaces={spaces}
          companies={companies}
          currentMember={currentMember}
          defaultStatus="pendiente"
          defaultSpaceId={space.id}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={() => { setEditing(null); setCreating(false); }}
        />
      )}
    </div>
  );
}

function ViewTab({ active, onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 14px", borderRadius: 8, border: "none",
        background: active ? DS.bg : "transparent",
        color: active ? DS.textPrimary : DS.textSecondary,
        fontSize: 12, fontWeight: active ? 600 : 500, cursor: "pointer",
        fontFamily: DS.font, display: "flex", alignItems: "center", gap: 6,
        boxShadow: active ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
      }}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}
