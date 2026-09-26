import { useState, useMemo } from "react";
import { format } from "date-fns";
import { DS } from "../../lib/design.js";
import { usePathRoute } from "../../lib/router.jsx";
import { Topbar } from "../layout/Topbar.jsx";
import { TasksBoard } from "./TasksBoard.jsx";
import { TasksList } from "./TasksList.jsx";
import { TaskModal } from "./TaskModal.jsx";
import { DayCapacity } from "./DayCapacity.jsx";
import { PrioritizeAIModal } from "./PrioritizeAIModal.jsx";
import { FilterToggleButton, FilterPanel } from "./FilterBar.jsx";
import { useTaskFilters } from "../hooks/useTaskFilters.js";
import { applyTaskFilters, emptyFilterState } from "./taskFilters.js";
import { ContentDetailPage } from "../contenido/ContentDetailPage.jsx";
import { EDIT_SUBSTATUS } from "../contenido/EditSubstatusPicker.jsx";
import { CONTENT_STATUS_LABEL } from "../contenido/ContentCard.jsx";

const EDIT_STATUS_COLORS = {
  to_film: "#E24B4A",
  to_edit: "#EC4899",
};

export function MyAgenda({ tasks, members, spaces, companies, contentItems, currentMember, targetMember, onBack }) {
  // URL: #/agenda/<view>   (view = list | board)
  const { segments, navigate } = usePathRoute({ prefix: "/equipo" });
  const validViews = ["list", "board"];
  // Sin vista en la URL: la última que eligió la persona; si nunca eligió, Tablero.
  const savedView = (() => { try { return localStorage.getItem("agenda_view"); } catch { return null; } })();
  const view = validViews.includes(segments[1]) ? segments[1] : validViews.includes(savedView) ? savedView : "board";
  const setView = (v) => { try { localStorage.setItem("agenda_view", v); } catch { /* sin storage */ } navigate(`/agenda/${v}`); };

  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedContentItem, setSelectedContentItem] = useState(null);

  const focusMember = targetMember || currentMember;
  const isOwn = focusMember?.id === currentMember?.id;
  const todayStr = format(new Date(), "yyyy-MM-dd");

  // Videos asignados al miembro con fecha de edición = hoy
  const editingToday = useMemo(() => {
    if (!focusMember?.id) return [];
    return (contentItems || []).filter(
      (i) =>
        i.assigned_editor_id === focusMember.id &&
        i.edit_due_date === todayStr &&
        ["to_film", "to_edit"].includes(i.status)
    );
  }, [contentItems, focusMember?.id, todayStr]);

  // Cada miembro tiene su propio storageKey para filtros.
  // Default SIN filtro de fecha: la agenda muestra TODAS las tareas del miembro.
  // Antes el default "Hoy/Ayer" ocultaba toda tarea sin fecha (las nuevas nacen
  // sin fecha) y parecía que "desaparecían". El usuario puede aplicar Hoy/Ayer
  // u otro filtro manualmente con el botón de filtros.
  const filters = useTaskFilters({
    storageKey: `agenda_${focusMember?.id || "none"}`,
    defaultState: emptyFilterState(),
  });

  // Tareas del miembro: asignadas a él O creadas por él (así nunca se le
  // "pierde" una tarea propia aunque no quedara auto-asignada).
  const myTasks = useMemo(
    () => (tasks || []).filter(
      (t) =>
        (t.assigneeIds || []).includes(focusMember?.id) ||
        t.created_by === focusMember?.id
    ),
    [tasks, focusMember?.id]
  );

  const filtered = useMemo(
    () => applyTaskFilters(myTasks, filters.state),
    [myTasks, filters.state]
  );

  const visibleSpaces = (spaces || []).filter(
    (s) => s.visibility === "shared" || s.owner_id === focusMember?.id
  );

  const pendingCount = myTasks.filter((t) => t.status !== "completado").length;

  // Detail inline de content item. IMPORTANTE: este early-return va DESPUÉS de
  // todos los hooks de arriba — si estuviera antes, al abrir un item se llamarían
  // menos hooks que en el render anterior → crash "Rendered fewer hooks".
  if (selectedContentItem) {
    const latest = (contentItems || []).find((i) => i.id === selectedContentItem.id) || selectedContentItem;
    return (
      <ContentDetailPage
        item={latest}
        members={members}
        currentMember={currentMember}
        onBack={() => setSelectedContentItem(null)}
        onSaved={() => setSelectedContentItem(null)}
      />
    );
  }

  return (
    <div style={{ fontFamily: DS.font }}>
      <Topbar
        title={isOwn ? "Mi agenda" : `Agenda de ${focusMember?.name || "…"}`}
        subtitle={`${pendingCount} pendiente${pendingCount === 1 ? "" : "s"} · todas las tareas en un lugar`}
        accent={focusMember?.color}
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {onBack && (
              <button
                onClick={onBack}
                style={{
                  padding: "6px 14px",
                  borderRadius: 50,
                  border: `1px solid ${DS.textHint}`,
                  background: "transparent",
                  color: DS.textSecondary,
                  fontSize: 11,
                  fontWeight: 600,
                  fontFamily: DS.font,
                  cursor: "pointer",
                }}
              >
                ← Volver
              </button>
            )}
            <button
              onClick={() => setAiOpen(true)}
              style={{
                padding: "8px 16px",
                borderRadius: 50,
                border: `1px solid ${DS.purple}55`,
                background: `${DS.purple}18`,
                color: DS.purple,
                fontSize: 11,
                fontWeight: 700,
                fontFamily: DS.font,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                letterSpacing: "0.04em",
              }}
              title="Priorizar con IA usando audio"
            >
              🎙️ Priorizar con IA
            </button>
          </div>
        }
      />

      {/* Toolbar row */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "flex-end",
        flexWrap: "wrap", gap: 10, marginBottom: 10,
      }}>
        <div style={{
          display: "flex", gap: 2,
          background: DS.bgCard, borderRadius: 10, padding: 3,
          width: "fit-content", border: DS.border,
        }}>
          <ViewTab active={view === "list"} onClick={() => setView("list")} icon="📋" label="Lista" />
          <ViewTab active={view === "board"} onClick={() => setView("board")} icon="📊" label="Tablero" />
        </div>
        <FilterToggleButton
          state={filters.state}
          open={filterOpen}
          onToggle={() => setFilterOpen((v) => !v)}
        />
        <button
          onClick={() => setCreating(true)}
          style={{
            padding: "7px 14px",
            borderRadius: 50,
            border: "none",
            background: DS.textPrimary,
            color: DS.bg,
            fontSize: 11,
            fontWeight: 700,
            fontFamily: DS.font,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          + Nueva tarea
        </button>
      </div>

      <FilterPanel
        {...filters}
        members={members}
        spaces={visibleSpaces}
        open={filterOpen}
      />

      {isOwn && <DayCapacity tasks={myTasks} memberId={currentMember?.id} onOpenRoutine={() => navigate("/rutina")} />}

      {editingToday.length > 0 && (
        <div style={{
          marginBottom: 18,
          background: "rgba(236,72,153,0.05)",
          border: "1px solid rgba(236,72,153,0.18)",
          borderRadius: 12,
          padding: "14px 16px",
        }}>
          <div style={{
            fontSize: 10, fontWeight: 700, color: "#EC4899",
            letterSpacing: "0.14em", marginBottom: 10,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            🎬 POR EDITAR HOY ({editingToday.length})
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 8,
          }}>
            {editingToday.map((item) => {
              const statusColor = EDIT_STATUS_COLORS[item.status] || DS.textMuted;
              const sub = item.edit_substatus && EDIT_SUBSTATUS[item.edit_substatus]
                ? EDIT_SUBSTATUS[item.edit_substatus]
                : null;
              return (
                <button
                  key={item.id}
                  onClick={() => setSelectedContentItem(item)}
                  style={{
                    display: "flex", flexDirection: "column", gap: 6,
                    textAlign: "left", padding: "10px 12px",
                    background: DS.bgCard, border: DS.border, borderRadius: 10,
                    cursor: "pointer", fontFamily: DS.font,
                  }}
                >
                  <div style={{
                    fontSize: 13, fontWeight: 600, color: DS.textPrimary,
                    lineHeight: 1.3,
                    display: "-webkit-box", WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical", overflow: "hidden",
                  }}>
                    {item.title}
                  </div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    <span style={{
                      fontSize: 10, fontWeight: 600, color: statusColor,
                      background: statusColor + "18", padding: "2px 8px",
                      borderRadius: 4, display: "inline-flex", alignItems: "center", gap: 4,
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: statusColor }} />
                      {CONTENT_STATUS_LABEL[item.status]}
                    </span>
                    {sub && (
                      <span style={{
                        fontSize: 10, fontWeight: 600, color: sub.color,
                        background: sub.color + "18", padding: "2px 8px",
                        borderRadius: 4, display: "inline-flex", alignItems: "center", gap: 4,
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: sub.color }} />
                        {sub.label}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {view === "list" ? (
        <TasksList
          tasks={filtered}
          members={members}
          companies={companies}
          currentMember={currentMember}
          onOpenTask={setEditing}
          onCreate={null}
          emptyHint="No tienes tareas con esos filtros."
        />
      ) : (
        <TasksBoard
          tasks={filtered}
          members={members}
          spaces={spaces}
          companies={companies}
          currentMember={currentMember}
          onOpenTask={setEditing}
          onCreate={null}
          emptyHint="No tienes tareas con esos filtros."
        />
      )}

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

      {aiOpen && (
        <PrioritizeAIModal
          tasks={myTasks.filter((t) => t.status !== "completado")}
          members={members}
          spaces={spaces}
          companies={companies}
          onClose={() => setAiOpen(false)}
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
