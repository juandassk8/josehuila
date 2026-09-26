import { DS, PRIORITY_COLORS, PRIORITY_LABEL } from "../../lib/design.js";
import { fmtDueDateWithTime, isOverdue, isDueToday } from "../../lib/dates.js";
import { setTaskStatus } from "./workspace_tasks_db.js";
import { cycleStatus } from "./statusCycle.js";
import { TaskTimer, computeCurrentSeconds } from "./TaskTimer.jsx";

function formatMMSS(total) {
  const s = Math.max(0, Math.floor(total));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (hh > 0) return `${hh}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

export function TaskCard({ task, members, spaces, companies, onClick, dragHandleProps, dragListeners, isDragging }) {
  const priorityColor = PRIORITY_COLORS[task.priority] || DS.blue;
  const done = task.status === "completado";
  const overdue = !done && isOverdue(task.due_date);
  const dueToday = !done && isDueToday(task.due_date);

  const space = spaces?.find((s) => s.id === task.space_id);
  const company = companies?.find((c) => c.id === task.company_id);
  const assignees = (task.assigneeIds || [])
    .map((id) => members?.find((m) => m.id === id))
    .filter(Boolean);
  const asg = assignees[0];

  return (
    <div
      onClick={(e) => { if (e.defaultPrevented) return; onClick?.(task); }}
      {...(dragHandleProps || {})}
      {...(dragListeners || {})}
      style={{
        position: "relative", overflow: "hidden",
        background: "var(--surface)",
        border: `1px solid ${overdue ? "rgba(226,75,74,0.4)" : "var(--line)"}`,
        borderRadius: 14,
        padding: "12px 13px 12px 16px",
        marginBottom: 10,
        cursor: isDragging ? "grabbing" : "pointer",
        opacity: isDragging ? 0.4 : 1,
        transition: "border-color 0.15s, box-shadow 0.15s",
        boxShadow: "var(--shadow)",
        fontFamily: DS.font,
      }}
    >
      {/* Franja de prioridad */}
      <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: priorityColor }} />

      <div style={{ display: "flex", alignItems: "flex-start", gap: 9, marginBottom: 9 }}>
        <button
          onClick={async (e) => {
            e.stopPropagation();
            e.preventDefault();
            await setTaskStatus(task.id, cycleStatus(task.status));
          }}
          title={`Cambiar estado (actual: ${task.status})`}
          style={{
            flexShrink: 0, width: 17, height: 17, borderRadius: "50%", marginTop: 1, padding: 0,
            border: `1.8px solid ${done ? "var(--green)" : "var(--line-2)"}`,
            background: done ? "var(--green)" : "transparent",
            cursor: "pointer", display: "grid", placeItems: "center",
          }}
        >
          {done && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{ color: "#FFFFFF" }}>
              <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
        <div
          style={{
            flex: 1, minWidth: 0,
            color: done ? "var(--ink-4)" : "var(--ink)",
            fontSize: 12.5, fontWeight: 600, lineHeight: 1.35, letterSpacing: "-0.01em",
            textDecoration: done ? "line-through" : "none",
            textWrap: "pretty",
          }}
        >
          {task.title}
          {task.recurrence_active && <span style={{ marginLeft: 6, fontSize: 11, color: "var(--ink-4)" }}>↻</span>}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={{ padding: "3px 9px", borderRadius: 999, fontSize: 10.5, fontWeight: 600, whiteSpace: "nowrap", background: priorityColor + "22", color: priorityColor }}>
          {PRIORITY_LABEL[task.priority] || task.priority}
        </span>
        {space && <Tag color={space.color || "var(--sel)"}>{space.name}</Tag>}
        {company && <Tag color="var(--amber)">{company.name}</Tag>}
        {task.due_date && (
          <span style={{ padding: "3px 9px", borderRadius: 999, fontSize: 10.5, fontWeight: 600, whiteSpace: "nowrap", background: "var(--chip)", color: overdue ? "var(--brand)" : dueToday ? "var(--amber)" : "var(--ink-3)" }}>
            {fmtDueDateWithTime(task.due_date, task.due_time)}
          </span>
        )}
        <span style={{ flex: 1, minWidth: 0 }} />
        {assignees.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
            {assignees.slice(0, 3).map((m, i) => (
              <div key={m.id} title={m.name}
                style={{
                  width: 21, height: 21, borderRadius: "50%", background: m.color || "var(--sel)",
                  border: `2px solid var(--surface-solid)`, color: "#FFFFFF", fontSize: 10, fontWeight: 700,
                  display: "grid", placeItems: "center", marginLeft: i > 0 ? -6 : 0,
                }}>{m.name?.charAt(0).toUpperCase()}</div>
            ))}
            {assignees.length > 3 && (
              <div style={{ marginLeft: -6, width: 21, height: 21, borderRadius: "50%", background: "var(--surface-2)", border: `2px solid var(--surface-solid)`, color: "var(--ink-3)", fontSize: 9, fontWeight: 700, display: "grid", placeItems: "center" }}>
                +{assignees.length - 3}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Pill de etiqueta con punto de color (espacio/empresa/tiempo).
function Tag({ color, children }) {
  return (
    <span
      style={{
        fontSize: 11, fontWeight: 500, color: "var(--ink-2)",
        background: "var(--chip)", padding: "3px 9px", borderRadius: 999,
        display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
        maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{children}</span>
    </span>
  );
}
