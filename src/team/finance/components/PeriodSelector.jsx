import { DS, darkInput, withAlpha } from "../../../lib/design.js";

const PRESETS = [
  { key: "this_month",  label: "Este mes" },
  { key: "next_30",     label: "Próx. 30d" },
  { key: "rolling_120", label: "90+30" },
  { key: "custom",      label: "Custom" },
];

export function PeriodSelector({ value, onChange, customRange, onCustomChange }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <div style={{
        display: "inline-flex", padding: 3, borderRadius: 50,
        background: DS.bgCard, border: DS.border,
      }}>
        {PRESETS.map((p) => {
          const active = value === p.key;
          return (
            <button
              key={p.key}
              onClick={() => onChange(p.key)}
              style={{
                padding: "6px 12px", borderRadius: 50,
                border: "none",
                background: active ? withAlpha(DS.green, "22") : "transparent",
                color: active ? DS.green : DS.textSecondary,
                fontSize: 11, fontWeight: 700,
                cursor: "pointer", fontFamily: DS.font,
              }}
            >{p.label}</button>
          );
        })}
      </div>
      {value === "custom" && (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            type="date"
            value={customRange?.from || ""}
            onChange={(e) => onCustomChange?.({ ...customRange, from: e.target.value })}
            style={{ ...darkInput, padding: "5px 8px", fontSize: 11, width: 130 }}
          />
          <span style={{ fontSize: 10, color: DS.textMuted }}>→</span>
          <input
            type="date"
            value={customRange?.to || ""}
            onChange={(e) => onCustomChange?.({ ...customRange, to: e.target.value })}
            style={{ ...darkInput, padding: "5px 8px", fontSize: 11, width: 130 }}
          />
        </div>
      )}
    </div>
  );
}
