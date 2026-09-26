import { DS, PRIORITY_COLORS } from "../../lib/design.js";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { useCompanyTaskActivity } from "./hooks/useCompanyTaskActivity.js";

// Timeline vertical de eventos de tareas. Consume el trigger de activity log
// que se dispara en INSERT/UPDATE de company_tasks.

const ACTION_META = {
  created: { verb: "creó", color: DS.blue },
  completed: { verb: "completó", color: DS.green },
  status_changed: { verb: "cambió el estado de", color: DS.amber },
  deleted: { verb: "eliminó", color: DS.red },
  restored: { verb: "restauró", color: DS.textSecondary },
  assigned: { verb: "asignó", color: DS.purple },
};

export function ActivityFeed({ companyId, members = [], limit = 50 }) {
  const { events, loading } = useCompanyTaskActivity(companyId, limit);

  const memberMap = new Map();
  members.forEach((m) => memberMap.set(m.id, m));

  return (
    <div style={{
      padding: "14px 16px",
      background: DS.bgCard,
      border: DS.border,
      borderRadius: 14,
      fontFamily: DS.font,
      color: DS.textPrimary,
      display: "flex", flexDirection: "column",
      maxHeight: "100%",
      minHeight: 320,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
        <span style={{
          width: 6, height: 6, borderRadius: "50%", background: DS.green,
          boxShadow: `0 0 6px ${DS.green}`,
        }} />
        <div style={{
          fontSize: 10.5, fontWeight: 800, letterSpacing: "0.18em",
          color: DS.textSecondary,
        }}>
          ACTIVITY · LIVE
        </div>
      </div>

      {loading && events.length === 0 && (
        <div style={{ fontSize: 12, color: DS.textMuted, padding: "20px 4px" }}>
          Cargando…
        </div>
      )}

      {!loading && events.length === 0 && (
        <div style={{
          fontSize: 12, color: DS.textMuted, padding: "24px 8px",
          textAlign: "center", lineHeight: 1.5,
        }}>
          Sin actividad reciente.<br />Crea una tarea para empezar.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10, overflowY: "auto", paddingRight: 2 }}>
        {events.map((ev) => (
          <ActivityRow key={ev.id} event={ev} memberMap={memberMap} />
        ))}
      </div>
    </div>
  );
}

function ActivityRow({ event, memberMap }) {
  const meta = ACTION_META[event.action] || { verb: event.action, color: DS.textMuted };
  const actor = event.member_id ? memberMap.get(event.member_id) : null;
  const actorName = actor?.name || event.actor_label || "Alguien";
  const actorColor = actor?.avatar_color || actor?.color || DS.textMuted;
  const title = event.payload?.title || "una tarea";
  const priority = event.payload?.priority;
  const priorityColor = priority ? PRIORITY_COLORS[priority] : null;
  const when = formatDistanceToNow(new Date(event.created_at), { locale: es })
    .replace("alrededor de ", "")
    .replace("menos de ", "~");

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      <div style={{
        width: 22, height: 22, borderRadius: "50%",
        background: actorColor, color: "#fff",
        fontSize: 10, fontWeight: 700,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0, marginTop: 1,
      }}>
        {actorName.charAt(0).toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: DS.textPrimary, lineHeight: 1.45 }}>
          <span style={{ fontWeight: 700 }}>{actorName.split(" ")[0]}</span>
          <span style={{ color: DS.textMuted }}> {meta.verb} </span>
          <span style={{ fontWeight: 600 }}>{title}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
          {priority && priorityColor && (
            <span style={{
              fontSize: 9, fontWeight: 700, color: priorityColor,
              display: "inline-flex", alignItems: "center", gap: 3,
              letterSpacing: "0.06em",
            }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: priorityColor }} />
              {priority}
            </span>
          )}
          <span style={{ fontSize: 10, color: DS.textMuted }}>{when}</span>
        </div>
      </div>
    </div>
  );
}
