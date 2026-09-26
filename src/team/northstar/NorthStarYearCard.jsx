import { useState } from "react";
import { DS } from "../../lib/design.js";
import { upsertYear } from "./db.js";

// Card del header anual. Inicia colapsada (chip compacto con el goal +
// streams totalizados); se expande al click para ver detalle de streams,
// reach targets, estrategia y equipo. Edición inline con on-blur save.
export function NorthStarYearCard({ year, data, onUpdate }) {
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!data) {
    return (
      <div style={{ padding: 16, borderRadius: 14, background: DS.bgCard, border: DS.border, color: DS.textMuted, fontSize: 12 }}>
        No hay seed para {year}. Corré <code>db/north_star.sql</code> en Supabase.
      </div>
    );
  }

  const totalStreams = (data.revenue_streams || []).reduce((s, r) => s + (Number(r.target_usd) || 0), 0);
  const goal = Number(data.goal_revenue_usd || 0);

  const persist = async (patch) => {
    setSaving(true);
    const next = await upsertYear({ ...data, ...patch });
    if (next) onUpdate(next);
    setSaving(false);
  };

  const fmtUSD = (n) => `$${Math.round(n / 1000)}K`;

  return (
    <div style={{
      borderRadius: 14, background: DS.bgCard, border: DS.border,
      overflow: "hidden",
    }}>
      {/* Header colapsado */}
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 14,
          padding: "16px 18px", background: "transparent", border: "none",
          cursor: "pointer", textAlign: "left", fontFamily: DS.font,
        }}
      >
        <div style={{ fontSize: 28 }}>🏔</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: DS.textMuted, letterSpacing: "0.14em" }}>
            NORTH STAR {year}
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: DS.textPrimary, marginTop: 2 }}>
            ${(goal / 1000).toFixed(0)}K USD/mes
            <span style={{ fontSize: 11, color: DS.textMuted, fontWeight: 600, marginLeft: 10 }}>
              {(data.revenue_streams || []).length} streams · ${(totalStreams / 1000).toFixed(0)}K target
            </span>
          </div>
        </div>
        <div style={{ fontSize: 11, color: DS.textMuted }}>{expanded ? "▾ Ocultar" : "▸ Ver detalle"}</div>
      </button>

      {expanded && (
        <div style={{ padding: "0 18px 18px", borderTop: DS.border, paddingTop: 14 }}>
          {/* Revenue streams */}
          <SectionTitle>💵 Revenue Streams</SectionTitle>
          <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
            {(data.revenue_streams || []).map((stream, i) => (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: "1.4fr 2fr 1.2fr 0.7fr", gap: 10,
                padding: "10px 12px", borderRadius: 10,
                background: "rgba(255,255,255,0.02)", border: DS.border,
                fontSize: 12,
              }}>
                <div style={{ fontWeight: 700, color: DS.textPrimary }}>{stream.name}</div>
                <div style={{ color: DS.textSecondary }}>{stream.offer}</div>
                <div style={{ color: DS.textMuted }}>{stream.volume}</div>
                <div style={{ fontWeight: 700, color: DS.green, textAlign: "right" }}>{fmtUSD(stream.target_usd)}</div>
              </div>
            ))}
          </div>

          {/* Reach targets */}
          <SectionTitle>📡 Reach Targets</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 16 }}>
            {[
              { key: "instagram", label: "Instagram", icon: "📸" },
              { key: "tiktok", label: "TikTok", icon: "🎵" },
              { key: "youtube", label: "YouTube", icon: "📹" },
              { key: "email", label: "Emails DB", icon: "📬" },
            ].map((t) => (
              <div key={t.key} style={{
                padding: "10px 12px", borderRadius: 10,
                background: "rgba(255,255,255,0.02)", border: DS.border,
              }}>
                <div style={{ fontSize: 11, color: DS.textMuted, marginBottom: 4 }}>{t.icon} {t.label}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: DS.textPrimary, fontVariantNumeric: "tabular-nums" }}>
                  {((data.reach_targets?.[t.key] || 0) / 1000).toFixed(0)}K
                </div>
              </div>
            ))}
          </div>

          {/* Estrategia de contenido */}
          <SectionTitle>🎬 Estrategia de Contenido</SectionTitle>
          <textarea
            defaultValue={data.content_strategy || ""}
            onBlur={(e) => persist({ content_strategy: e.target.value })}
            placeholder="Volumen, enfoque, misión…"
            rows={3}
            style={textareaStyle}
          />

          {/* Equipo */}
          <SectionTitle>👥 InForce Squad</SectionTitle>
          <div style={{ display: "grid", gap: 6 }}>
            {(data.team_roster || []).map((m, i) => (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: "200px 1fr", gap: 10,
                padding: "8px 12px", borderRadius: 8,
                background: "rgba(255,255,255,0.02)", border: DS.border, fontSize: 12,
              }}>
                <div style={{ fontWeight: 700, color: DS.textPrimary }}>{m.role}</div>
                <div style={{ color: DS.textSecondary }}>{m.scope}</div>
              </div>
            ))}
          </div>

          {saving && <div style={{ fontSize: 10, color: DS.textMuted, marginTop: 8 }}>Guardando…</div>}
        </div>
      )}
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, color: DS.textMuted,
      letterSpacing: "0.14em", marginBottom: 8, marginTop: 4,
    }}>
      {children}
    </div>
  );
}

const textareaStyle = {
  width: "100%", padding: "10px 12px", borderRadius: 10,
  border: DS.border, background: "rgba(255,255,255,0.02)",
  color: DS.textPrimary, fontSize: 12, lineHeight: 1.5,
  fontFamily: DS.font, outline: "none", resize: "vertical",
  marginBottom: 14, boxSizing: "border-box",
};
