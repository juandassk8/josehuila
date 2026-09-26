import { DS, PRIORITY_COLORS, PRIORITY_LABEL } from "../../lib/design.js";
import { fmtDueDateWithTime, isOverdue, isDueToday } from "../../lib/dates.js";
import { setTaskStatus } from "../data/db.js";
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

const STATUS_ICONS = {
  pendiente: { icon: "○", color: "#9B9A97" },
  en_curso: { icon: "◐", color: DS.blue },
  completado: { icon: "●", color: DS.green },
};

export function TaskCard({ task, members, spaces, companies, onClick, dragHandleProps, dragListeners, isDragging }) {
  const priorityColor = PRIORITY_COLORS[task.priority] || DS.blue;
  const overdue = task.status !== "completado" && isOverdue(task.due_date);
  const dueToday = task.status !== "completado" && isDueToday(task.due_date);

  const space = spaces?.find((s) => s.id === task.space_id);
  const company = companies?.find((c) => c.id === task.company_id);

  const assignees = (task.assigneeIds || [])
    .map((id) => members?.find((m) => m.id === id))
    .filter(Boolean);

  // Tareas auto-generadas de revisión: armamos el link al vuelo con el slug
  // actual de la company para no depender de link_url stale en DB.
  const resolveReviewUrl = () => {
    if (!task.auto_generated && !task.link_url) return null;
    const fallback = task.link_url || null;
    const slug = company?.slug
      || (company?.name || "").toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!slug) return fallback;
    let url = `${window.location.origin}/admin/${slug}/pipeline`;
    // ?highlight={slotId} — el workspace abre el SlotModal del slot
    // representativo automáticamente. Sin esto, Natt tendría que buscar
    // a mano cuál de los slots en pide_revision corresponde a la task.
    if (task.slot_id) url += `?highlight=${encodeURIComponent(task.slot_id)}`;
    return url;
  };
  const reviewUrl = task.auto_generated || task.link_url ? resolveReviewUrl() : null;
  const handleClick = (e) => {
    if (e.defaultPrevented) return;
    if (reviewUrl) {
      window.open(reviewUrl, "_blank", "noopener");
      return;
    }
    onClick?.(task);
  };

  return (
    <div
      onClick={handleClick}
      {...(dragHandleProps || {})}
      {...(dragListeners || {})}
      className="card-hover"
      style={{
        background: DS.bgCard,
        border: `1px solid ${overdue ? "rgba(226,75,74,0.4)" : DS.textHint}`,
        borderRadius: 14,
        padding: "14px 15px",
        marginBottom: 12,
        cursor: isDragging ? "grabbing" : "pointer",
        opacity: isDragging ? 0.4 : 1,
        transition: "border-color 0.15s, box-shadow 0.15s",
        fontFamily: DS.font,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
        <button
          onClick={async (e) => {
            e.stopPropagation();
            e.preventDefault();
            await setTaskStatus(task.id, cycleStatus(task.status));
          }}
          title={`Cambiar estado (actual: ${task.status})`}
          style={{
            background: "transparent", border: "none", cursor: "pointer",
            fontSize: 16, color: (STATUS_ICONS[task.status] || STATUS_ICONS.pendiente).color,
            padding: 0, flexShrink: 0, lineHeight: 1,
            width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center",
            marginTop: 1,
          }}
        >{(STATUS_ICONS[task.status] || STATUS_ICONS.pendiente).icon}</button>
        <div
          style={{
            flex: 1,
            color: DS.textPrimary,
            fontSize: 14,
            fontWeight: 600,
            lineHeight: 1.35,
            letterSpacing: "-0.01em",
            textDecoration: task.status === "completado" ? "line-through" : "none",
            opacity: task.status === "completado" ? 0.5 : 1,
          }}
        >
          {task.title}
          {task.recurrence_active && <span style={{ marginLeft: 6, fontSize: 10, color: DS.textMuted }}>↻</span>}
        </div>
      </div>

      {task.description && (
        <div
          style={{
            color: DS.textSecondary,
            fontSize: 12.5,
            lineHeight: 1.5,
            marginBottom: 12,
            marginLeft: 28,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {task.description}
        </div>
      )}

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 7,
          marginLeft: 28,
        }}
      >
        <PriorityPill color={priorityColor} label={PRIORITY_LABEL[task.priority] || task.priority} />
        {task.status !== "completado" && (
          <TaskTimer task={task} size="sm" />
        )}
        {task.status === "completado" && task.time_spent_seconds > 0 && (
          <Tag color={DS.green}>{formatMMSS(computeCurrentSeconds(task))}</Tag>
        )}
        {space && (
          <Tag color={space.color || DS.blue}>{space.name}</Tag>
        )}
        {company && <Tag color={DS.amber}>{company.name}</Tag>}
        {task.due_date && (
          <Tag color={overdue ? DS.red : dueToday ? DS.amber : DS.textMuted} strong={overdue || dueToday}>
            {fmtDueDateWithTime(task.due_date, task.due_time)}
          </Tag>
        )}
        <div style={{ flex: 1, minWidth: 0 }} />
        {assignees.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
            {assignees.slice(0, 3).map((m, i) => (
              <div
                key={m.id}
                title={m.name}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: m.color || DS.blue,
                  border: `2px solid ${DS.bgSide}`,
                  color: DS.textPrimary,
                  fontSize: 10,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginLeft: i > 0 ? -6 : 0,
                }}
              >
                {m.name?.charAt(0).toUpperCase()}
              </div>
            ))}
            {assignees.length > 3 && (
              <div
                style={{
                  marginLeft: -6,
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: DS.bgCard,
                  border: `2px solid ${DS.bgSide}`,
                  color: DS.textMuted,
                  fontSize: 9,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                +{assignees.length - 3}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Pill de prioridad: fondo tenue + texto del color (Urgente rojo, Alta ámbar…).
function PriorityPill({ color, label }) {
  return (
    <span
      style={{
        fontSize: 11, fontWeight: 600, color,
        background: color + "22",
        padding: "3px 9px", borderRadius: 999,
        letterSpacing: "-0.01em", whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

// Pill de etiqueta/meta: punto de color + texto claro (espacio, empresa, fecha).
function Tag({ color, children, strong }) {
  return (
    <span
      style={{
        fontSize: 11.5, fontWeight: 500,
        color: strong ? color : DS.textSecondary,
        background: "var(--chip)",
        padding: "3px 9px", borderRadius: 999,
        display: "inline-flex", alignItems: "center", gap: 6,
        letterSpacing: "-0.01em", whiteSpace: "nowrap",
        maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{children}</span>
    </span>
  );
}
