import { DS } from "../../lib/design.js";
import { weekLabel, weekStartMonday, addDays, isoDate } from "../../lib/weeks.js";

export function WeekSelector({ weekStart, onChange }) {
  const prev = addDays(weekStart, -7);
  const next = addDays(weekStart, 7);
  const today = weekStartMonday(new Date());
  const isCurrent = isoDate(weekStart) === isoDate(today);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <IconButton onClick={() => onChange(prev)} title="Semana anterior">◀</IconButton>
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: DS.textPrimary,
          fontFamily: DS.font,
          padding: "6px 14px",
          borderRadius: 50,
          background: DS.bgCard,
          border: DS.border,
          minWidth: 140,
          textAlign: "center",
        }}
      >
        {weekLabel(weekStart)}
        {isCurrent && (
          <span
            style={{
              marginLeft: 8,
              fontSize: 9,
              color: DS.green,
              letterSpacing: "0.1em",
              fontWeight: 700,
            }}
          >
            HOY
          </span>
        )}
      </div>
      <IconButton onClick={() => onChange(next)} title="Semana siguiente">▶</IconButton>
      {!isCurrent && (
        <button
          onClick={() => onChange(today)}
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
          Hoy
        </button>
      )}
    </div>
  );
}

function IconButton({ children, onClick, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 30,
        height: 30,
        borderRadius: "50%",
        border: `1px solid ${DS.textHint}`,
        background: "transparent",
        color: DS.textSecondary,
        fontSize: 11,
        cursor: "pointer",
        fontFamily: DS.font,
      }}
    >
      {children}
    </button>
  );
}
