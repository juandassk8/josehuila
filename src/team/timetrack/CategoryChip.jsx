// Chip/card de categoría reutilizable. Variantes:
//   "card"       — usado en TimeTrackerPage. Card grande con total y barra de %.
//   "fullscreen" — fila inferior del FullscreenTimer. Compact, con tecla rápida.

import { DS, withAlpha } from "../../lib/design.js";
import { formatHumanDurationLong } from "./lib/timeMath.js";

export function CategoryChip({
  category,
  isActive,
  onClick,
  totalSeconds = 0,
  percent = null, // 0..1 o null para esconder
  variant = "card",
  hotkey = null, // "1".."9"
  onEdit = null,
}) {
  const color = category.color || DS.blue;

  if (variant === "fullscreen") {
    return (
      <button
        onClick={onClick}
        title={`${category.name}${hotkey ? ` (tecla ${hotkey})` : ""}`}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 14px",
          borderRadius: 999,
          border: `1px solid ${isActive ? color : "rgba(255,255,255,0.10)"}`,
          background: isActive ? withAlpha(color, "22") : "rgba(255,255,255,0.02)",
          color: DS.textPrimary,
          fontFamily: DS.font,
          fontSize: 13,
          fontWeight: isActive ? 700 : 500,
          cursor: "pointer",
          transition: "background 0.15s, border-color 0.15s",
          letterSpacing: "0.01em",
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: color,
            boxShadow: isActive ? `0 0 0 4px ${withAlpha(color, "33")}` : "none",
            transition: "box-shadow 0.2s",
          }}
        />
        <span>{category.name}</span>
        {hotkey && (
          <span
            style={{
              fontSize: 10,
              color: DS.textMuted,
              border: `1px solid ${DS.textHint}`,
              borderRadius: 4,
              padding: "1px 5px",
              fontFamily: "ui-monospace, monospace",
            }}
          >
            {hotkey}
          </span>
        )}
      </button>
    );
  }

  // "card"
  return (
    <button
      onClick={onClick}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        textAlign: "left",
        padding: "16px 18px",
        borderRadius: DS.radius,
        background: isActive ? withAlpha(color, "14") : DS.bgCard,
        border: isActive ? `1px solid ${color}` : DS.border,
        color: DS.textPrimary,
        fontFamily: DS.font,
        cursor: "pointer",
        transition: "background 0.15s, border-color 0.15s, transform 0.1s",
        overflow: "hidden",
        minHeight: 110,
      }}
      onMouseEnter={(e) => {
        if (!isActive) e.currentTarget.style.borderColor = "rgba(255,255,255,0.18)";
      }}
      onMouseLeave={(e) => {
        if (!isActive) e.currentTarget.style.borderColor = DS.border.replace("1px solid ", "");
      }}
    >
      {/* Acento lateral */}
      <span
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          background: color,
          borderTopLeftRadius: DS.radius,
          borderBottomLeftRadius: DS.radius,
          opacity: isActive ? 1 : 0.55,
        }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 18 }}>{category.icon || "⏱"}</span>
        <span
          style={{
            flex: 1,
            fontSize: 14,
            fontWeight: 600,
            color: DS.textPrimary,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {category.name}
        </span>
        {isActive && (
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: color,
              animation: "tt-pulse 1.6s ease-in-out infinite",
              flexShrink: 0,
            }}
          />
        )}
        {onEdit && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.stopPropagation();
                onEdit();
              }
            }}
            style={{
              fontSize: 12,
              color: DS.textMuted,
              padding: "2px 6px",
              borderRadius: 6,
              cursor: "pointer",
            }}
            title="Editar categoría"
          >
            ⋯
          </span>
        )}
      </div>

      <div
        style={{
          fontSize: 22,
          fontWeight: 200,
          letterSpacing: "0.01em",
          color: DS.textPrimary,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {formatHumanDurationLong(totalSeconds)}
      </div>

      {percent !== null && percent !== undefined && (
        <div style={{ marginTop: 12 }}>
          <div
            style={{
              height: 4,
              background: "rgba(255,255,255,0.06)",
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${Math.min(100, Math.round(percent * 100))}%`,
                height: "100%",
                background: color,
                transition: "width 0.3s",
              }}
            />
          </div>
          <div style={{ fontSize: 10, color: DS.textMuted, marginTop: 6, letterSpacing: "0.04em" }}>
            {Math.round(percent * 100)}% del período
          </div>
        </div>
      )}
    </button>
  );
}
