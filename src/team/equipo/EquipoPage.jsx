import { useMemo, useState } from "react";
import { DS, ROLE_LABEL } from "../../lib/design.js";
import { Topbar } from "../layout/Topbar.jsx";
import { ProfileModal } from "./ProfileModal.jsx";
import { CreateMemberModal } from "./CreateMemberModal.jsx";
import { daysUntilBirthday, fmtBirthday, isOnlineSince, fmtRelative } from "../../lib/dates.js";

export function EquipoPage({ members, tasks, currentMember, onRefresh }) {
  const [editingMember, setEditingMember] = useState(null);
  const [creatingMember, setCreatingMember] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const isAdmin = currentMember?.role === "admin";

  const { activeList, inactiveCount } = useMemo(() => {
    const active = (members || []).filter((m) => m.active !== false);
    const inactive = (members || []).filter((m) => m.active === false);
    return {
      activeList: showInactive ? [...active, ...inactive] : active,
      inactiveCount: inactive.length,
    };
  }, [members, showInactive]);

  return (
    <div>
      <Topbar
        title="Equipo"
        subtitle={`${activeList.length} integrantes${inactiveCount > 0 && !showInactive ? ` · ${inactiveCount} desactivados ocultos` : ""}`}
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {isAdmin && inactiveCount > 0 && (
              <button
                onClick={() => setShowInactive((v) => !v)}
                style={{
                  padding: "7px 14px",
                  borderRadius: 50,
                  border: `1px solid ${DS.textHint}`,
                  background: showInactive ? `${DS.amber}18` : "transparent",
                  color: showInactive ? DS.amber : DS.textSecondary,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: DS.font,
                }}
              >
                {showInactive ? "Ocultar desactivados" : `Mostrar desactivados (${inactiveCount})`}
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => setCreatingMember(true)}
                style={{
                  padding: "8px 16px",
                  borderRadius: 50,
                  border: "none",
                  background: DS.blue,
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: DS.font,
                  letterSpacing: "0.02em",
                }}
              >
                + Agregar integrante
              </button>
            )}
          </div>
        }
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          gap: 16,
        }}
      >
        {activeList.map((m) => {
          const openTasks = tasks.filter(
            (t) => t.status !== "completado" && (t.assigneeIds || []).includes(m.id)
          ).length;
          const bDays = daysUntilBirthday(m.birthday_day, m.birthday_month);
          const online = isOnlineSince(m.last_seen_at, 5);

          const isInactive = m.active === false;
          return (
            <button
              key={m.id}
              onClick={() => setEditingMember(m)}
              style={{
                textAlign: "left",
                background: DS.bgCard,
                border: `1px solid ${m.id === currentMember?.id ? (m.color || DS.blue) + "55" : DS.textHint}`,
                borderRadius: 16,
                padding: 18,
                cursor: "pointer",
                fontFamily: DS.font,
                position: "relative",
                overflow: "hidden",
                transition: "transform 0.15s, border-color 0.15s",
                opacity: isInactive ? 0.55 : 1,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 3,
                  background: `linear-gradient(90deg, ${m.color || DS.blue}, transparent)`,
                }}
              />

              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: "50%",
                    background: m.color || DS.blue,
                    color: DS.textPrimary,
                    fontSize: 18,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    position: "relative",
                  }}
                >
                  {m.name?.charAt(0).toUpperCase()}
                  {online && (
                    <div
                      style={{
                        position: "absolute",
                        bottom: -2,
                        right: -2,
                        width: 14,
                        height: 14,
                        borderRadius: "50%",
                        background: DS.green,
                        border: `3px solid ${DS.bg}`,
                      }}
                    />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: DS.textPrimary, fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                    {m.name}
                    {isInactive && (
                      <span style={{
                        fontSize: 9,
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: 50,
                        background: "rgba(226,75,74,0.15)",
                        color: DS.red,
                        letterSpacing: "0.06em",
                      }}>DESACTIVADO</span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: m.color || DS.blue,
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                    }}
                  >
                    {ROLE_LABEL[m.role] || m.role}
                  </div>
                  <div style={{ fontSize: 10, color: DS.textMuted, marginTop: 3 }}>
                    {online ? "live ahora" : fmtRelative(m.last_seen_at) || "sin actividad"}
                  </div>
                </div>
              </div>

              {m.bio && (
                <div
                  style={{
                    fontSize: 11,
                    color: DS.textSecondary,
                    lineHeight: 1.5,
                    marginBottom: 12,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {m.bio}
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  gap: 8,
                  fontSize: 10,
                  color: DS.textMuted,
                  flexWrap: "wrap",
                }}
              >
                <Pill color={DS.blue}>📌 {openTasks} abiertas</Pill>
                {bDays != null && (
                  <Pill color={bDays <= 7 ? DS.amber : DS.textMuted}>
                    🎂 {bDays === 0 ? "Hoy" : bDays <= 7 ? `${bDays}d` : fmtBirthday(m.birthday_day, m.birthday_month)}
                  </Pill>
                )}
                {m.email && <Pill color={DS.textMuted}>✉ {m.email}</Pill>}
              </div>
            </button>
          );
        })}
      </div>
      {editingMember && (
        <ProfileModal
          member={editingMember}
          currentMember={currentMember}
          onClose={() => setEditingMember(null)}
          onSaved={() => {
            setEditingMember(null);
            onRefresh?.();
          }}
        />
      )}
      {creatingMember && (
        <CreateMemberModal
          onClose={() => setCreatingMember(false)}
          onCreated={() => {
            setCreatingMember(false);
            onRefresh?.();
          }}
        />
      )}
    </div>
  );
}

function Pill({ color, children }) {
  return (
    <span
      style={{
        padding: "4px 10px",
        borderRadius: 50,
        background: color + "18",
        color,
        fontSize: 10,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}
