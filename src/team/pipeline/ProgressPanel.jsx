import { DS } from "../../lib/design.js";
import { STAGES, STAGE_META, calcProgress } from "./pipelineConstants.js";

// Panel de progreso (README §2 / prototipo): % + "de avance", barra con etiquetas
// Idea/In Campaign debajo, 3 pills y un tile por etapa. Dentro de un brief los
// tiles son botones de filtro (onStageFilter).
export function ProgressPanel({ slots = [], stageFilter = null, onStageFilter = null }) {
  const pct = calcProgress(slots);
  const done = pct >= 100;
  const total = slots.length;
  // "Listos" es lo que alguien marcó como hecho en su etapa, no lo que ya pasó
  // a campaña: eso último se mueve en tanda y no dice quién terminó qué.
  const listos = slots.filter((s) => s.stage_done).length;
  const publicados = slots.filter((s) => s.publicado).length;
  const countByStage = (stage) => slots.filter((s) => s.stage === stage).length;
  const inBrief = !!onStageFilter;

  const pill = (n, label, color) => (
    <div key={label} style={{ display: "flex", alignItems: "baseline", gap: 6, padding: "8px 13px", borderRadius: 12, background: "var(--chip)" }}>
      <span className="mono" style={{ fontSize: 16, fontWeight: 500, color }}>{n}</span>
      <span style={{ fontSize: 11.5, color: DS.textMuted }}>{label}</span>
    </div>
  );

  return (
    <div className="glass" style={{ margin: "18px 30px 0", borderRadius: 20, padding: "18px 20px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Fila 1 */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span className="mono" style={{ fontSize: 38, fontWeight: 500, letterSpacing: "-0.035em", lineHeight: 1, color: done ? "var(--green)" : "var(--sel)" }}>{pct}%</span>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: DS.textMuted }}>de avance</span>
        </div>
        <div style={{ flex: "1 1 260px", minWidth: 180, display: "flex", flexDirection: "column", gap: 7 }}>
          <div style={{ height: 10, borderRadius: 999, background: "var(--chip)", overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", borderRadius: 999, background: done ? "var(--green)" : "var(--sel)", transition: "width .3s ease" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: DS.textHint }}>
            <span>Idea</span><span>In Campaign</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
          {pill(total, "contenidos", "var(--ink)")}
          {pill(listos, "listos", "var(--amber)")}
          {pill(publicados, "publicados", "var(--green)")}
        </div>
      </div>

      {/* Fila 2: tiles por etapa */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))", gap: 8 }}>
        {STAGES.map((stage) => {
          const meta = STAGE_META[stage];
          const n = countByStage(stage);
          const active = inBrief && stageFilter === stage;
          return (
            <button
              key={stage} type="button" disabled={!inBrief}
              onClick={inBrief ? () => onStageFilter(active ? null : stage) : undefined}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 12, textAlign: "left", width: "100%",
                cursor: inBrief ? "pointer" : "default", fontFamily: DS.font,
                background: active ? meta.tint : "var(--chip)",
                border: `1px solid ${active ? "transparent" : "var(--line)"}`,
                boxShadow: active ? "var(--sel-rim)" : "none",
                transition: "box-shadow .15s ease",
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: 999, flex: "none", background: meta.color, opacity: n ? 1 : 0.4 }} />
              <span style={{ fontSize: 12, fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: n ? DS.textSecondary : "var(--ink-4)" }}>{meta.label}</span>
              <span className="mono" style={{ fontSize: 14, fontWeight: 500, color: n ? meta.color : "var(--ink-4)" }}>{n}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
