import { DS } from "../../lib/design.js";
import { setTaskStatus, updateTask, replaceAssignees } from "../data/db.js";
import { StatusDropdown } from "./StatusDropdown.jsx";
import { PriorityDropdown } from "./PriorityDropdown.jsx";
import { AssigneeDropdown } from "./AssigneeDropdown.jsx";
import { DateDropdown } from "./DateDropdown.jsx";
import { TaskTimer } from "./TaskTimer.jsx";

const STATUS_STYLES = {
  pendiente: { icon: "○", color: "#9B9A97", label: "Pendiente" },
  en_curso: { icon: "◐", color: DS.blue, label: "En curso" },
  completado: { icon: "●", color: DS.green, label: "Completado" },
};

export function TasksList({ tasks, members, companies, currentMember, onOpenTask, onCreate, emptyHint }) {
  const grouped = {
    pendiente: (tasks || []).filter((t) => t.status === "pendiente"),
    en_curso: (tasks || []).filter((t) => t.status === "en_curso"),
    completado: (tasks || []).filter((t) => t.status === "completado"),
  };

  return (
    <div style={{ fontFamily: DS.font }}>
      {/* Header */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 140px 140px 130px 110px",
        gap: 12,
        padding: "8px 16px",
        fontSize: 10,
        fontWeight: 700,
        color: DS.textMuted,
        letterSpacing: "0.12em",
        borderBottom: DS.border,
      }}>
        <div>NOMBRE</div>
        <div>ASIGNADO</div>
        <div>FECHA LÍMITE</div>
        <div>PRIORIDAD</div>
        <div>TIEMPO</div>
      </div>

      {Object.entries(grouped).map(([status, items]) => (
        <StatusGroup
          key={status}
          status={status}
          items={items}
          members={members}
          companies={companies}
          onOpenTask={onOpenTask}
          onCreate={onCreate}
        />
      ))}

      {(tasks || []).length === 0 && (
        <div style={{
          padding: "40px 16px", textAlign: "center",
          color: DS.textMuted, fontSize: 13,
        }}>
          {emptyHint || "No hay tareas aún."}
        </div>
      )}
    </div>
  );
}

function StatusGroup({ status, items, members, companies, onOpenTask, onCreate }) {
  const st = STATUS_STYLES[status];

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "12px 16px 6px", fontSize: 11, fontWeight: 700,
        color: st.color, letterSpacing: "0.08em",
      }}>
        <span style={{ fontSize: 14 }}>{st.icon}</span>
        <span>{st.label.toUpperCase()}</span>
        <span style={{ color: DS.textMuted, fontWeight: 500 }}>{items.length}</span>
      </div>

      {items.map((task) => (
        <TaskRow key={task.id} task={task} members={members} companies={companies} onOpenTask={onOpenTask} />
      ))}

      <button
        onClick={() => onCreate?.(status)}
        style={{
          width: "100%", textAlign: "left", padding: "8px 16px",
          background: "transparent", border: "none", color: DS.textMuted,
          fontSize: 12, cursor: "pointer", fontFamily: DS.font,
        }}
      >+ Agregar Tarea</button>
    </div>
  );
}

function TaskRow({ task, members, companies, onOpenTask }) {
  const st = STATUS_STYLES[task.status] || STATUS_STYLES.pendiente;
  const assigneeIds = task.assigneeIds || [];

  const company = companies?.find((c) => c.id === task.company_id);
  const resolveReviewUrl = () => {
    if (!task.auto_generated && !task.link_url) return null;
    const fallback = task.link_url || null;
    const slug = company?.slug
      || (company?.name || "").toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!slug) return fallback;
    let url = `${window.location.origin}/admin/${slug}/pipeline`;
    if (task.slot_id) url += `?highlight=${encodeURIComponent(task.slot_id)}`;
    return url;
  };
  const reviewUrl = task.auto_generated || task.link_url ? resolveReviewUrl() : null;
  const handleRowClick = () => {
    if (reviewUrl) {
      window.open(reviewUrl, "_blank", "noopener");
      return;
    }
    onOpenTask?.(task);
  };

  return (
    <div
      onClick={handleRowClick}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 140px 140px 130px 110px",
        gap: 12,
        padding: "10px 16px",
        borderBottom: DS.border,
        cursor: "pointer",
        alignItems: "center",
        fontSize: 13,
        transition: "background 0.1s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = DS.bgCard)}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {/* Name with status circle (dropdown) */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <StatusDropdown
          value={task.status}
          onChange={async (newStatus) => { await setTaskStatus(task.id, newStatus); }}
        >
          <span title={`Cambiar estado (actual: ${st.label})`} style={{
            fontSize: 16, color: st.color,
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 22, height: 22,
          }}>{st.icon}</span>
        </StatusDropdown>
        <span style={{
          color: task.status === "completado" ? DS.textMuted : DS.textPrimary,
          textDecoration: task.status === "completado" ? "line-through" : "none",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {task.title}
          {task.recurrence_active && <span style={{ marginLeft: 6, color: DS.textMuted }}>🔄</span>}
        </span>
      </div>

      {/* Assignees (dropdown) */}
      <AssigneeDropdown
        members={members}
        selected={assigneeIds}
        onChange={async (newAssignees) => { await replaceAssignees(task.id, newAssignees); }}
      />

      {/* Due date (dropdown) */}
      <DateDropdown
        date={task.due_date}
        time={task.due_time}
        onChange={async ({ date, time }) => {
          await updateTask(task.id, { due_date: date || null, due_time: time || null });
        }}
      />

      {/* Priority (dropdown) */}
      <PriorityDropdown
        value={task.priority}
        onChange={async (newPriority) => { await updateTask(task.id, { priority: newPriority }); }}
      />

      {/* Timer */}
      <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center" }}>
        <TaskTimer task={task} size="sm" />
      </div>
    </div>
  );
}
