import { DS } from "../../lib/design.js";
import { DAY_LABELS_LONG, isoDate } from "../../lib/weeks.js";
import { buildReportLookup, buildSlaLookup } from "./trackingStatus.js";

const ROW_COL = 150;

const ROWS = [
  { key: "am_10", label: "Reporte 10 AM", icon: "📈" },
  { key: "pm_3",  label: "Reporte 3 PM",  icon: "📊" },
  { key: "sla",   label: "Soporte (SOS)", icon: "🆘" },
];

export function PerformanceGrid({ days, reports, sla, onReportClick, onSlaClick }) {
  const reportLookup = buildReportLookup(reports);
  const slaLookup = buildSlaLookup(sla);

  const tableStyle = {
    display: "grid",
    gridTemplateColumns: `${ROW_COL}px repeat(${days.length}, minmax(110px, 1fr))`,
    gap: 1,
    background: DS.textHint,
    border: DS.border,
    borderRadius: 10,
    overflow: "hidden",
    fontFamily: DS.font,
  };

  return (
    <div style={{ width: "100%" }}>
      <div style={tableStyle}>
        <HeaderCell label="Reporte" leading />
        {days.map((d, i) => (
          <HeaderCell
            key={i}
            label={DAY_LABELS_LONG[i]}
            sub={`${d.getDate()}/${d.getMonth() + 1}`}
          />
        ))}

        {ROWS.map((row) => (
          <RowCells
            key={row.key}
            row={row}
            days={days}
            reportLookup={reportLookup}
            slaLookup={slaLookup}
            onReportClick={onReportClick}
            onSlaClick={onSlaClick}
          />
        ))}
      </div>
    </div>
  );
}

function RowCells({ row, days, reportLookup, slaLookup, onReportClick, onSlaClick }) {
  return (
    <>
      <div
        style={{
          padding: "12px 14px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          color: DS.textPrimary,
          fontSize: 12,
          fontWeight: 600,
          background: DS.bgSide,
        }}
      >
        <span style={{ fontSize: 14 }}>{row.icon}</span>
        <span>{row.label}</span>
      </div>
      {days.map((d, i) => {
        const dISO = isoDate(d);
        if (row.key === "sla") {
          const items = slaLookup.get(dISO) || [];
          const note = items[0]?.question || "";
          return (
            <SlaCell
              key={i}
              note={note}
              onClick={() => onSlaClick(d)}
            />
          );
        }
        const key = `${dISO}__${row.key}`;
        const report = reportLookup.get(key) || null;
        return (
          <ReportCell
            key={i}
            report={report}
            onClick={() => onReportClick({ date: d, type: row.key, report })}
          />
        );
      })}
    </>
  );
}

function HeaderCell({ label, sub, leading }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        background: DS.bgSide,
        color: DS.textSecondary,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        textAlign: leading ? "left" : "center",
      }}
    >
      <div>{label}</div>
      {sub && (
        <div style={{ fontSize: 10, letterSpacing: 0, color: DS.textMuted, fontWeight: 500, marginTop: 2, textTransform: "none" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function ReportCell({ report, onClick }) {
  const sent = !!report?.sent_at;
  const hasData = !!report && (report.roas != null || report.spend != null || report.conversion_value != null);
  const color = sent ? DS.green : hasData ? DS.amber : null;
  const sentTime = sent ? new Date(report.sent_at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }) : null;

  return (
    <button
      onClick={onClick}
      style={{
        background: DS.bg,
        padding: 8,
        border: "none",
        minHeight: 58,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        alignItems: "flex-start",
        justifyContent: "center",
        cursor: "pointer",
        fontFamily: DS.font,
        textAlign: "left",
      }}
    >
      {!report && (
        <span style={{ color: DS.textMuted, fontSize: 12 }}>+ Registrar</span>
      )}
      {report && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
            <span style={{ color: color || DS.textMuted }}>{sent ? "✓" : hasData ? "⏳" : "○"}</span>
            <span style={{ color: DS.textPrimary }}>{sentTime || (hasData ? "Borrador" : "Pendiente")}</span>
          </div>
          {report.roas != null && (
            <div style={{ fontSize: 10, color: DS.textSecondary }}>
              ROAS {Number(report.roas).toFixed(2)}x
              {report.roas_target != null && (
                <span style={{ color: DS.textMuted }}> / {Number(report.roas_target).toFixed(2)}x</span>
              )}
            </div>
          )}
        </>
      )}
    </button>
  );
}

function SlaCell({ note, onClick }) {
  const hasNote = !!note && note.trim().length > 0;
  return (
    <button
      onClick={onClick}
      style={{
        background: DS.bg,
        padding: 8,
        border: "none",
        minHeight: 58,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        alignItems: "flex-start",
        justifyContent: hasNote ? "flex-start" : "center",
        cursor: "pointer",
        fontFamily: DS.font,
        textAlign: "left",
        overflow: "hidden",
      }}
    >
      {!hasNote && <span style={{ color: DS.textMuted, fontSize: 12 }}>+ Anotar soporte</span>}
      {hasNote && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
            <span style={{ color: DS.green }}>✓</span>
            <span style={{ color: DS.textPrimary }}>Con nota</span>
          </div>
          <div
            style={{
              fontSize: 10,
              color: DS.textSecondary,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              lineHeight: 1.35,
            }}
          >
            {note}
          </div>
        </>
      )}
    </button>
  );
}
