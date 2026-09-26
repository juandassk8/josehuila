import { DS } from "../../lib/design.js";

export function Topbar({ title, subtitle, actions }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        marginBottom: 26,
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
        <div
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: DS.neon,
            boxShadow: `0 0 12px ${DS.neon}`,
            flexShrink: 0,
            marginTop: 12,
          }}
        />
        <div>
          <h1
            style={{
              fontSize: 30,
              fontWeight: 700,
              color: DS.textPrimary,
              letterSpacing: "-0.03em",
              margin: 0,
              lineHeight: 1.05,
              textWrap: "pretty",
            }}
          >
            {title}
          </h1>
          {subtitle && (
            <div
              style={{
                fontSize: 12.5,
                color: DS.textMuted,
                letterSpacing: "-0.01em",
                marginTop: 5,
              }}
            >
              {subtitle}
            </div>
          )}
        </div>
      </div>
      {actions && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 2 }}>
          {actions}
        </div>
      )}
    </div>
  );
}
