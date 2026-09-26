import { DS } from "./design.js";

// Toggle Anuncios / Orgánico. Se renderiza donde sea relevante (header de
// Despliegue, header de Pipeline, Guionista, Agenda…). Solo lo ve admin
// global — el workspace cliente recibe pipelineType='organic' hardcoded.

const TYPES = [
  { key: "ads",     label: "📢 Anuncios", color: "#E24B4A" },
  { key: "organic", label: "🌱 Orgánico", color: "#1DB97A" },
];

export function PipelineTypeToggle({ value, onChange, size = "md" }) {
  const padding = size === "sm" ? "5px 12px" : "7px 16px";
  const fontSize = size === "sm" ? 11 : 12;
  return (
    <div style={{
      display: "inline-flex", gap: 3, padding: 3,
      background: "rgba(127,127,127,0.08)",
      border: "1px solid rgba(127,127,127,0.15)",
      borderRadius: 50,
    }}>
      {TYPES.map((t) => {
        const active = value === t.key;
        return (
          <button
            key={t.key}
            onClick={() => onChange?.(t.key)}
            style={{
              padding, borderRadius: 50, border: "none",
              background: active ? t.color : "transparent",
              color: active ? "#FFFFFF" : DS.textSecondary,
              fontSize, fontWeight: 700,
              cursor: "pointer", fontFamily: DS.font,
              letterSpacing: "0.02em",
              transition: "background 120ms ease, color 120ms ease",
              whiteSpace: "nowrap",
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export const PIPELINE_TYPE_LABEL = {
  ads: "Anuncios",
  organic: "Orgánico",
};

export function pipelineTypeLabel(type) {
  return PIPELINE_TYPE_LABEL[type] || type;
}
