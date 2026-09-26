import { DS, withAlpha } from "../../../lib/design.js";

// Card de KPI: título arriba, número grande, subtítulo + contexto.
// Soporta variantes: 'primary' (verde — hero), 'warning' (amber), 'danger' (red), 'neutral'.
export function KpiCard({ title, value, sub, hint, variant = "neutral", icon }) {
  const COLORS = {
    primary: DS.green,
    warning: DS.amber,
    danger: DS.red,
    neutral: DS.blue,
  };
  const accent = COLORS[variant] || DS.blue;
  return (
    <div style={{
      padding: "12px 14px",
      borderRadius: 10,
      background: DS.bgCard,
      border: `1px solid ${withAlpha(accent, "22")}`,
      display: "flex",
      flexDirection: "column",
      gap: 2,
    }}>
      <div style={{
        fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
        textTransform: "uppercase", color: DS.textMuted,
        display: "flex", alignItems: "center", gap: 5,
      }}>
        {icon && <span style={{ fontSize: 11, letterSpacing: 0 }}>{icon}</span>}
        {title}
      </div>
      <div style={{
        fontSize: 20, fontWeight: 700, color: DS.textPrimary,
        letterSpacing: "-0.02em", lineHeight: 1.15, marginTop: 2,
        fontVariantNumeric: "tabular-nums",
      }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: DS.textMuted }}>{sub}</div>
      )}
      {hint && (
        <div style={{ fontSize: 10, color: accent, fontWeight: 600 }}>
          {hint}
        </div>
      )}
    </div>
  );
}
