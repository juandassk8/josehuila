import { useMemo, useState } from "react";
import { DS } from "../../lib/design.js";
import { ContenidoGrid } from "./ContenidoGrid.jsx";
import { PerformanceGrid } from "./PerformanceGrid.jsx";
import {
  clientHealthDot,
  contentSummary,
  performanceSummary,
} from "./trackingStatus.js";
import { isoDate } from "../../lib/weeks.js";

export function ClientTrackingBlock({
  company,
  days,
  milestones,   // all for the week, we filter by company_id inside
  reports,
  sla,
  initiallyExpanded = true,
  onOpenMilestone,
  onOpenReport,
  onOpenSla,
}) {
  const [expanded, setExpanded] = useState(initiallyExpanded);

  const cId = String(company.id);

  const cMilestones = useMemo(
    () => milestones.filter((m) => String(m.company_id) === cId),
    [milestones, cId]
  );
  const cReports = useMemo(
    () => reports.filter((r) => String(r.company_id) === cId),
    [reports, cId]
  );
  const cSla = useMemo(
    () => sla.filter((s) => String(s.company_id) === cId),
    [sla, cId]
  );

  // Days elapsed in the week (for health calc): min(today - monday, 6)
  const today = new Date();
  const monday = days[0];
  const daysElapsed = Math.min(
    Math.max(Math.floor((today - monday) / (1000 * 60 * 60 * 24)) + 1, 0),
    6
  );

  const health = clientHealthDot({
    milestones: cMilestones,
    reports: cReports,
    sla: cSla,
    daysElapsed,
  });
  const cSum = contentSummary(cMilestones);
  const pSum = performanceSummary(cReports, cSla);

  return (
    <div
      style={{
        background: DS.bgCard,
        border: DS.border,
        borderRadius: 12,
        marginBottom: 14,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 18px",
          border: "none",
          background: "transparent",
          cursor: "pointer",
          textAlign: "left",
          fontFamily: DS.font,
        }}
      >
        <span style={{ color: DS.textMuted, fontSize: 10 }}>{expanded ? "▼" : "▶"}</span>
        <span
          title={health.label}
          style={{
            width: 10, height: 10, borderRadius: "50%", background: health.dot,
            boxShadow: `0 0 8px ${health.dot}88`, flexShrink: 0,
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: DS.textPrimary, fontSize: 15, fontWeight: 700 }}>
            {company.name}
          </div>
          <div style={{ color: DS.textMuted, fontSize: 11, marginTop: 2 }}>
            Contenido: {cSum.categoriesHit}/{cSum.categoriesTotal} categorías · {cSum.approved}/{cSum.total} hitos ✓
            {"  ·  "}
            Performance: {pSum.sent}/{pSum.total} reportes ✓ · {pSum.daysWithNote > 0 ? `${pSum.daysWithNote} día${pSum.daysWithNote > 1 ? "s" : ""} con soporte` : "sin soporte registrado"}
          </div>
        </div>
      </button>

      {/* Body */}
      {expanded && (
        <div style={{ padding: "6px 14px 18px" }}>
          <SectionLabel icon="📝" label="Contenido" accent={DS.purple} />
          <ContenidoGrid
            days={days}
            milestones={cMilestones}
            onCellClick={(ctx) =>
              onOpenMilestone({ ...ctx, company })
            }
          />

          <div style={{ height: 14 }} />

          <SectionLabel icon="📊" label="Performance" accent={DS.blue} />
          <PerformanceGrid
            days={days}
            reports={cReports}
            sla={cSla}
            onReportClick={(ctx) => onOpenReport({ ...ctx, company })}
            onSlaClick={(date) => onOpenSla({ date, company, items: cSla.filter((s) => s.day_date === isoDate(date)) })}
          />
        </div>
      )}
    </div>
  );
}

function SectionLabel({ icon, label, accent }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 2px 8px",
        color: DS.textSecondary,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
      }}
    >
      <span style={{ width: 4, height: 12, background: accent, borderRadius: 2 }} />
      <span>{icon}</span>
      <span>{label}</span>
    </div>
  );
}
