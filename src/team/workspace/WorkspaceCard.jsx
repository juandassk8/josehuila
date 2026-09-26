import { DS } from "../../lib/design.js";

// Tarjeta grande del workspace.
// Props:
//   icon, title, subtitle
//   chips: [{ label, status }] — status = 'verde'|'naranja'|'rojo'|'gris'
//   metric: string opcional (e.g. "33% semanal")
//   cta: string
//   onClick (si null, disabled)
//   accent: color del borde/acento
export function WorkspaceCard({ icon, title, subtitle, chips, metric, cta, onClick, accent, disabled }) {
  const color = accent || DS.blue;
  const interactive = !!onClick && !disabled;

  return (
    <div
      onClick={interactive ? onClick : undefined}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={(e) => {
        if (!interactive) return;
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); }
      }}
      style={{
        background: DS.bgCard,
        border: DS.border,
        borderRadius: 16,
        padding: 22,
        position: "relative",
        overflow: "hidden",
        cursor: interactive ? "pointer" : "default",
        opacity: disabled ? 0.6 : 1,
        transition: "transform 0.15s, border 0.15s",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        minHeight: 190,
      }}
      onMouseEnter={(e) => {
        if (interactive) e.currentTarget.style.borderColor = `${color}55`;
      }}
      onMouseLeave={(e) => {
        if (interactive) e.currentTarget.style.borderColor = "";
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: `linear-gradient(90deg, ${color}, transparent)`,
          opacity: 0.8,
        }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: 12,
            background: `${color}18`,
            border: `1px solid ${color}30`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 22,
          }}
        >
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: DS.textPrimary, fontSize: 15, fontWeight: 700 }}>
            {title}
          </div>
          {subtitle && (
            <div style={{ color: DS.textMuted, fontSize: 11, letterSpacing: "0.06em", marginTop: 2 }}>
              {subtitle}
            </div>
          )}
        </div>
      </div>

      {chips && chips.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {chips.map((c, i) => (
            <StatusChip key={i} label={c.label} status={c.status} />
          ))}
        </div>
      )}

      {metric && (
        <div
          style={{
            fontSize: 12,
            color: DS.textSecondary,
            fontWeight: 500,
            fontFamily: DS.font,
          }}
        >
          {metric}
        </div>
      )}

      <div style={{ flex: 1 }} />

      {cta && (
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: interactive ? color : DS.textMuted,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          {cta}
        </div>
      )}
    </div>
  );
}

function StatusChip({ label, status }) {
  const color =
    status === "verde" ? DS.green :
    status === "naranja" ? DS.amber :
    status === "rojo" ? DS.red : DS.textHint;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px 4px 8px",
        borderRadius: 50,
        background: `${color}12`,
        border: `1px solid ${color}30`,
      }}
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: color,
          boxShadow: status !== "gris" ? `0 0 0 2px ${color}22` : "none",
        }}
      />
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: DS.textSecondary,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
    </div>
  );
}
