import { DS, ROLE_LABEL } from "../../lib/design.js";
import { isOnlineSince, fmtRelative } from "../../lib/dates.js";
import { useScorecardPreviews } from "../hooks/useScorecardPreviews.js";
import { dayStatus } from "../scorecard/scorecardStatus.js";
import { yesterdayISODate, todayISODate } from "../../lib/weeks.js";

export function TeamStrip({ members, tasks, currentMemberId, currentMemberRole, onOpenWorkspace }) {
  const memberIds = (members || []).map((m) => m.id);
  const { kpisByMember, entriesByMember } = useScorecardPreviews(memberIds);

  if (!members?.length) return null;

  const yesterday = yesterdayISODate();
  const today = todayISODate();
  const todayDate = new Date();
  const yDate = new Date();
  yDate.setDate(yDate.getDate() - 1);

  const isAdmin = currentMemberRole === "admin";

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: DS.textPrimary, letterSpacing: "-0.02em" }}>Equipo</span>
        <span style={{
          fontSize: 11.5, fontWeight: 600, color: DS.textMuted,
          padding: "3px 9px", borderRadius: 999, background: "var(--chip)",
        }}>
          {members.filter((m) => isOnlineSince(m.last_seen_at, 5)).length} en línea
        </span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${Math.max(members.length, 1)}, minmax(220px, 1fr))`,
          gap: 12,
        }}
      >
        {members.map((m) => {
          const current = m.current_task_id ? tasks.find((t) => t.id === m.current_task_id) : null;
          const fallbackActive = (tasks || [])
            .filter((t) => t.status !== "completado" && (t.assigneeIds || []).includes(m.id))
            .sort((a, b) => {
              const order = { urgente: 0, alta: 1, normal: 2, baja: 3 };
              return order[a.priority] - order[b.priority];
            })[0];
          const shownTask = current || fallbackActive;
          const online = isOnlineSince(m.last_seen_at, 5);
          const isSelf = m.id === currentMemberId;
          const canOpen = isSelf || isAdmin;

          // Preview chips calc
          const memberKpis = kpisByMember[m.id] || [];
          const hasScorecard = memberKpis.length > 0;
          const memberEntries = entriesByMember[m.id] || [];

          let chipYesterday = null;
          let chipToday = null;
          if (hasScorecard) {
            const valuesOn = (dateStr) =>
              memberKpis.map((k) => {
                const ent = memberEntries.find(
                  (e) => e.kpi_id === k.id && e.date === dateStr
                );
                return ent ? ent.value : null;
              });
            chipYesterday = dayStatus({ values: valuesOn(yesterday), date: yDate });
            chipToday = dayStatus({ values: valuesOn(today), date: todayDate });
          }

          return (
            <div
              key={m.id}
              onClick={canOpen && onOpenWorkspace ? () => onOpenWorkspace(m.id) : undefined}
              role={canOpen ? "button" : undefined}
              tabIndex={canOpen ? 0 : undefined}
              onKeyDown={(e) => {
                if (!canOpen || !onOpenWorkspace) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpenWorkspace(m.id);
                }
              }}
              style={{
                background: DS.bgCard,
                border: `1px solid ${isSelf ? (m.color || DS.blue) + "55" : DS.textHint}`,
                borderRadius: 14,
                padding: 14,
                position: "relative",
                overflow: "hidden",
                cursor: canOpen ? "pointer" : "default",
                transition: "border 0.15s, transform 0.15s",
              }}
              onMouseEnter={(e) => {
                if (canOpen) e.currentTarget.style.borderColor = (m.color || DS.blue) + "88";
              }}
              onMouseLeave={(e) => {
                if (canOpen) e.currentTarget.style.borderColor = isSelf ? (m.color || DS.blue) + "55" : DS.textHint;
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    background: m.color || DS.blue,
                    color: DS.textPrimary,
                    fontSize: 14,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: online ? `0 0 0 2px ${DS.bg}, 0 0 0 4px ${m.color || DS.blue}55` : "none",
                    position: "relative",
                  }}
                >
                  {m.name?.charAt(0).toUpperCase()}
                  {online && (
                    <div
                      style={{
                        position: "absolute",
                        bottom: -1,
                        right: -1,
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background: DS.green,
                        border: `2px solid ${DS.bg}`,
                      }}
                    />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      color: DS.textPrimary,
                      fontSize: 13,
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {m.name}
                  </div>
                  <div style={{ fontSize: 11, color: DS.textMuted, letterSpacing: "-0.01em" }}>
                    {ROLE_LABEL[m.role] || m.role} · {online ? "en línea" : fmtRelative(m.last_seen_at) || "desconectado"}
                  </div>
                </div>
              </div>

              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: DS.textMuted,
                  letterSpacing: "-0.01em",
                  marginBottom: 5,
                }}
              >
                Tarea actual
              </div>
              <div
                style={{
                  color: shownTask ? DS.textPrimary : DS.textMuted,
                  fontSize: 12,
                  fontWeight: 500,
                  lineHeight: 1.4,
                  minHeight: 32,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                  marginBottom: 10,
                }}
              >
                {shownTask ? shownTask.title : "Sin tareas activas"}
              </div>

              <StatusLine label="Scorecard" yesterday={chipYesterday} today={chipToday} muted={!hasScorecard} />
              <StatusLine label="Tracking" yesterday={null} today={null} muted />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatusLine({ label, yesterday, today, muted }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 0 0",
        borderTop: "1px solid rgba(255,255,255,0.04)",
        marginTop: 4,
        opacity: muted ? 0.55 : 1,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: DS.textMuted,
          letterSpacing: "-0.01em",
          flex: 1,
        }}
      >
        {label}
      </div>
      <MiniChip label="ayer" status={yesterday} />
      <MiniChip label="hoy" status={today} />
    </div>
  );
}

function MiniChip({ label, status }) {
  const color =
    status === "verde" ? DS.green :
    status === "naranja" ? DS.amber :
    status === "rojo" ? DS.red : DS.textHint;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: color,
          boxShadow: status && status !== "gris" ? `0 0 0 2px ${color}22` : "none",
        }}
      />
      <div style={{ fontSize: 9, color: DS.textMuted, letterSpacing: "0.08em" }}>
        {label}
      </div>
    </div>
  );
}
