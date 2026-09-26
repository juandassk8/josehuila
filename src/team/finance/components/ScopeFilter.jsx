import { DS, withAlpha } from "../../../lib/design.js";

const SCOPES = [
  { key: "all",           label: "Total",        color: DS.textPrimary },
  { key: "agency",        label: "Agencia",      color: DS.blue },
  { key: "personal",      label: "Personal",     color: "#A855F7" },
  { key: "family",        label: "Familia",      color: "#F97316" },
  { key: "content_capex", label: "Content",      color: "#D4A93B" },
];

export function ScopeFilter({ value, onChange }) {
  return (
    <div style={{
      display: "inline-flex",
      padding: 3,
      borderRadius: 50,
      background: DS.bgCard,
      border: DS.border,
      flexWrap: "wrap",
    }}>
      {SCOPES.map((s) => {
        const active = value === s.key;
        return (
          <button
            key={s.key}
            onClick={() => onChange(s.key)}
            style={{
              padding: "6px 12px",
              borderRadius: 50,
              border: "none",
              background: active ? withAlpha(s.color, "22") : "transparent",
              color: active ? s.color : DS.textSecondary,
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: DS.font,
              letterSpacing: "0.02em",
            }}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

export const SCOPE_LIST = SCOPES;
