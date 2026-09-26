import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { DS } from "../lib/design.js";
import { useTheme } from "../lib/theme.jsx";
import { ROLE_BY_KEY, ROLES } from "./team_roles.js";

// Perfil de miembro abierto desde el War Room. Tres tabs:
//   1) Scorecard — placeholder (sistema de scorecard aún no existe).
//   2) Mis tareas — placeholder (sistema de tareas aún no existe).
//   3) Manuales — links de curso WoW + manuales de plataforma por cada rol del miembro.

const TABS = [
  { key: "scorecard", label: "Scorecard", icon: "📈" },
  { key: "tareas",    label: "Mis tareas", icon: "📋" },
  { key: "manuales",  label: "Manuales", icon: "📚" },
];

const MANUAL_TYPE_META = {
  course:   { label: "Curso WoW",   icon: "🎓", color: "#8B5CF6" },
  platform: { label: "Plataforma",  icon: "⚙️", color: "#3B8BD4" },
  resource: { label: "Recurso",     icon: "📎", color: "#1DB97A" },
};

export function CompanyMemberProfile({ member, onClose, onEdit, isAdmin }) {
  const { isDark } = useTheme();
  const T = DS;

  const [activeTab, setActiveTab] = useState("manuales");

  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", h);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  if (!member) return null;

  const accent = member.avatar_color || "#3B8BD4";
  const roleKeys = member.roles || [];
  const primaryRole = roleKeys.length > 0 ? ROLE_BY_KEY[roleKeys[0]] : null;
  const liveHandle = primaryRole?.liveName || (member.is_owner ? "owner.live" : "team.live");

  const modalBg = isDark ? "#0E0E14" : "#FFFFFF";
  const divider = isDark ? "1px solid rgba(255,255,255,0.07)" : "1px solid rgba(55,53,47,0.09)";
  const softBg = isDark ? "rgba(255,255,255,0.03)" : "rgba(55,53,47,0.03)";

  const node = (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: isDark ? "rgba(0,0,0,0.7)" : "rgba(15,15,15,0.45)",
        zIndex: 10002, display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16, fontFamily: T.font, overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: modalBg,
          border: divider,
          borderRadius: 18,
          width: "100%", maxWidth: 640,
          color: T.textPrimary,
          boxShadow: isDark ? "0 30px 80px rgba(0,0,0,0.7)" : "0 30px 80px rgba(15,15,15,0.18)",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* Close X */}
        <button
          onClick={onClose}
          style={{
            position: "absolute", top: 14, right: 14,
            width: 30, height: 30, borderRadius: 8,
            border: divider, background: isDark ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.8)",
            color: T.textSecondary, cursor: "pointer",
            fontSize: 15, fontFamily: "inherit",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 2,
          }}
        >
          ×
        </button>

        {/* Header con accent */}
        <div style={{
          padding: "28px 28px 22px",
          background: `linear-gradient(180deg, ${accent}${isDark ? "22" : "14"} 0%, transparent 100%)`,
          borderBottom: divider,
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
            <div style={{
              padding: 3, borderRadius: "50%",
              border: `2px solid ${accent}`,
              flexShrink: 0,
            }}>
              <Avatar name={member.name} color={accent} size={66} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase",
                color: "#1DB97A",
                padding: "3px 9px", borderRadius: 50,
                background: "rgba(29,185,122,0.15)",
                marginBottom: 6,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#1DB97A" }} />
                {liveHandle}
              </div>
              <div style={{
                fontSize: 24, fontWeight: 800, color: T.textPrimary,
                letterSpacing: "-0.01em", lineHeight: 1.15,
              }}>
                {member.name}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
                {member.is_owner && (
                  <Chip color="#F5A623" isDark={isDark}>👑 Dueño</Chip>
                )}
                {member.is_ugc_pool && (
                  <Chip color="#E24B4A" isDark={isDark}>📹 UGC pool</Chip>
                )}
                {roleKeys.map((rk) => {
                  const r = ROLE_BY_KEY[rk];
                  if (!r) return null;
                  return (
                    <Chip key={rk} color={r.color} isDark={isDark}>
                      {r.icon} {r.label}
                    </Chip>
                  );
                })}
              </div>
              {(member.phone || (member.birthday_day && member.birthday_month)) && (
                <div style={{ fontSize: 11, color: T.textMuted, marginTop: 10, display: "flex", gap: 14, flexWrap: "wrap" }}>
                  {member.phone && <span>📱 {member.phone}</span>}
                  {member.birthday_day && member.birthday_month && (
                    <span>🎂 {member.birthday_day}/{String(member.birthday_month).padStart(2, "0")}</span>
                  )}
                </div>
              )}
            </div>
            {isAdmin && onEdit && (
              <button
                onClick={onEdit}
                style={{
                  padding: "7px 14px", borderRadius: 50,
                  border: divider, background: softBg,
                  color: T.textSecondary, cursor: "pointer",
                  fontSize: 11, fontWeight: 600, fontFamily: "inherit",
                  flexShrink: 0,
                }}
              >
                Editar perfil
              </button>
            )}
          </div>

          {member.bio && (
            <div style={{
              marginTop: 14, fontSize: 12.5, lineHeight: 1.55,
              color: T.textSecondary,
            }}>
              {member.bio}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div style={{
          display: "flex", gap: 2, padding: "10px 20px 0",
          borderBottom: divider,
        }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                padding: "10px 14px",
                background: "transparent",
                border: "none",
                borderBottom: activeTab === t.key ? `2px solid ${accent}` : "2px solid transparent",
                color: activeTab === t.key ? T.textPrimary : T.textMuted,
                fontSize: 12.5, fontWeight: 700, fontFamily: "inherit",
                cursor: "pointer", letterSpacing: "0.01em",
                marginBottom: -1,
              }}
            >
              <span style={{ marginRight: 5 }}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ padding: "22px 28px 28px", maxHeight: "50vh", overflowY: "auto" }}>
          {activeTab === "scorecard" && (
            <ScorecardTab member={member} T={T} isDark={isDark} />
          )}
          {activeTab === "tareas" && (
            <TareasTab member={member} T={T} isDark={isDark} />
          )}
          {activeTab === "manuales" && (
            <ManualesTab member={member} T={T} isDark={isDark} accent={accent} />
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}

function ScorecardTab({ member, T, isDark }) {
  // Placeholder — el sistema de scorecard aún no existe.
  return (
    <div>
      <Banner
        icon="🚧"
        title="Scorecard en construcción"
        body="Pronto vas a poder trackear KPIs personales por rol: cumplimiento de cadencia del copy, volumen del content pool, ROAS del trafficker, velocidad de edición del editor, etc."
        isDark={isDark}
        T={T}
      />
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginTop: 14,
      }}>
        <MetricPlaceholder label="Cumplimiento semanal" T={T} isDark={isDark} />
        <MetricPlaceholder label="Scorecard total" T={T} isDark={isDark} />
        <MetricPlaceholder label="Racha de entregas" T={T} isDark={isDark} />
        <MetricPlaceholder label="Meta del mes" T={T} isDark={isDark} />
      </div>
    </div>
  );
}

function TareasTab({ member, T, isDark }) {
  // Placeholder — no hay sistema de tareas todavía.
  return (
    <div>
      <Banner
        icon="📋"
        title="Tareas asignadas"
        body={`${member.name} aún no tiene tareas activas en la plataforma. El sistema de tareas por miembro se integra con el pipeline (Despliegue → slots asignados) y va a llegar en la próxima versión.`}
        isDark={isDark}
        T={T}
      />
      <div style={{
        marginTop: 14, padding: "18px 16px", borderRadius: 12,
        background: isDark ? "rgba(255,255,255,0.02)" : "rgba(55,53,47,0.02)",
        border: isDark ? "1px dashed rgba(255,255,255,0.1)" : "1px dashed rgba(55,53,47,0.12)",
        textAlign: "center",
        color: T.textMuted, fontSize: 12, lineHeight: 1.6,
      }}>
        Sin tareas activas.
      </div>
    </div>
  );
}

function ManualesTab({ member, T, isDark, accent }) {
  const roleKeys = member.roles || [];
  const manualsByRole = useMemo(() => {
    return roleKeys
      .map((rk) => ROLE_BY_KEY[rk])
      .filter(Boolean)
      .map((role) => ({
        role,
        manuals: role.manuals || [],
      }));
  }, [roleKeys]);

  if (manualsByRole.length === 0) {
    return (
      <Banner
        icon="📚"
        title="Sin roles asignados"
        body="Asigná al menos un rol al miembro para ver sus manuales de ejecución, cursos de WoW y guías de la plataforma."
        isDark={isDark}
        T={T}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {manualsByRole.map(({ role, manuals }) => (
        <div key={role.key}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8, marginBottom: 10,
          }}>
            <div style={{
              width: 26, height: 26, borderRadius: 8,
              background: `${role.color}${isDark ? "22" : "15"}`,
              color: role.color, fontSize: 14,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {role.icon}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary, lineHeight: 1.1 }}>
                {role.label}
              </div>
              <div style={{ fontSize: 10, color: T.textMuted, letterSpacing: "0.04em", marginTop: 2 }}>
                {manuals.length} manual{manuals.length !== 1 ? "es" : ""}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {manuals.map((man, i) => (
              <ManualRow key={i} manual={man} T={T} isDark={isDark} />
            ))}
          </div>
        </div>
      ))}
      <button
        disabled
        title="Próximamente"
        style={{
          padding: "10px 14px", borderRadius: 10,
          background: "transparent",
          border: isDark ? "1px dashed rgba(255,255,255,0.15)" : "1px dashed rgba(55,53,47,0.15)",
          color: T.textMuted, fontSize: 11.5, fontWeight: 600,
          cursor: "not-allowed", fontFamily: "inherit",
          letterSpacing: "0.02em", opacity: 0.8,
        }}
      >
        + Agregar manual personalizado · próximamente
      </button>
    </div>
  );
}

function ManualRow({ manual, T, isDark }) {
  const meta = MANUAL_TYPE_META[manual.type] || MANUAL_TYPE_META.resource;
  const hasUrl = !!manual.url;

  const Outer = hasUrl ? "a" : "div";
  const outerProps = hasUrl
    ? { href: manual.url, target: "_blank", rel: "noopener noreferrer" }
    : {};

  return (
    <Outer
      {...outerProps}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "11px 14px", borderRadius: 10,
        background: isDark ? "rgba(255,255,255,0.03)" : "rgba(55,53,47,0.02)",
        border: isDark ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(55,53,47,0.06)",
        color: T.textPrimary, textDecoration: "none",
        cursor: hasUrl ? "pointer" : "default",
        fontFamily: "inherit",
        transition: "background 120ms ease",
      }}
      onMouseEnter={hasUrl ? (e) => { e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.05)" : "rgba(55,53,47,0.05)"; } : undefined}
      onMouseLeave={hasUrl ? (e) => { e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.03)" : "rgba(55,53,47,0.02)"; } : undefined}
    >
      <div style={{
        width: 30, height: 30, borderRadius: 8, flexShrink: 0,
        background: `${meta.color}${isDark ? "22" : "15"}`,
        color: meta.color, fontSize: 14,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {meta.icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: T.textPrimary, lineHeight: 1.3 }}>
          {manual.label}
        </div>
        <div style={{ fontSize: 10, color: T.textMuted, letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 2 }}>
          {meta.label}{hasUrl ? "" : " · link pendiente"}
        </div>
      </div>
      {hasUrl && (
        <div style={{ fontSize: 13, color: T.textMuted, flexShrink: 0 }}>↗</div>
      )}
    </Outer>
  );
}

function Banner({ icon, title, body, T, isDark }) {
  return (
    <div style={{
      padding: "16px 18px", borderRadius: 12,
      background: isDark ? "rgba(255,255,255,0.03)" : "rgba(55,53,47,0.03)",
      border: isDark ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(55,53,47,0.06)",
      display: "flex", gap: 12, alignItems: "flex-start",
    }}>
      <div style={{ fontSize: 22, flexShrink: 0 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary, marginBottom: 4 }}>
          {title}
        </div>
        <div style={{ fontSize: 11.5, color: T.textSecondary, lineHeight: 1.55 }}>
          {body}
        </div>
      </div>
    </div>
  );
}

function MetricPlaceholder({ label, T, isDark }) {
  return (
    <div style={{
      padding: "14px 14px", borderRadius: 10,
      background: isDark ? "rgba(255,255,255,0.02)" : "rgba(55,53,47,0.02)",
      border: isDark ? "1px dashed rgba(255,255,255,0.08)" : "1px dashed rgba(55,53,47,0.09)",
    }}>
      <div style={{ fontSize: 9, color: T.textMuted, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 700 }}>
        {label}
      </div>
      <div style={{ fontSize: 20, color: T.textMuted, fontWeight: 700, marginTop: 4 }}>
        —
      </div>
    </div>
  );
}

function Chip({ children, color, isDark }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "3px 9px", borderRadius: 50,
      background: `${color}${isDark ? "22" : "15"}`,
      color: color,
      border: `1px solid ${color}${isDark ? "44" : "35"}`,
      fontSize: 10.5, fontWeight: 700,
      letterSpacing: "0.02em",
    }}>
      {children}
    </span>
  );
}

function Avatar({ name, color, size = 32 }) {
  const initials = (name || "?")
    .split(" ")
    .map((w) => w.charAt(0))
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: color || "#3B8BD4",
      color: "#fff", fontSize: Math.round(size * 0.38), fontWeight: 700,
      display: "flex", alignItems: "center", justifyContent: "center",
      letterSpacing: "0.02em",
    }}>
      {initials}
    </div>
  );
}
