import { useEffect, useMemo, useState } from "react";
import { DS } from "../../lib/design.js";
import { getCompanyFull, listReportsForCompany } from "../data/db.js";
import { getClientHomeUrl } from "../../lib/urls.js";
import {
  calcMetrics,
  fmtCOP,
  fmtNum,
  fmtInt,
  classifyMetric,
  defaultObjectives,
} from "../../lib/reports/metrics.js";
import {
  getReportDates,
  sortReportsByDate,
  shortDate,
} from "../../lib/reports/periods.js";
import {
  RANGE_PRESETS,
  selectReportsForRange,
  aggregateReports,
} from "../../lib/reports/ranges.js";

// Panel read-only de anuncios con filtro por rango y KPIs agregados.
export function CompanyStatsPanel({ companyId, companyName, onOpenReport, onOpenWorkspace }) {
  const [company, setCompany] = useState(null);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rangeKey, setRangeKey] = useState("7d");

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([getCompanyFull(companyId), listReportsForCompany(companyId)])
      .then(([cRes, rRes]) => {
        if (cancelled) return;
        if (cRes.error) { setError(cRes.error.message); setLoading(false); return; }
        setCompany(cRes.data || null);
        const rows = (rRes.data || []).map((r) => ({
          id: r.id,
          period: r.period,
          createdAt: r.created_at,
          ...r.data,
        }));
        setReports(rows);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(String(e?.message || e));
        setLoading(false);
      });
    return () => { cancelled = true };
  }, [companyId]);

  const sorted = useMemo(() => sortReportsByDate(reports), [reports]);
  const objectives = company?.objectives || defaultObjectives;
  const preset = RANGE_PRESETS.find((p) => p.key === rangeKey) || RANGE_PRESETS[1];
  const range = useMemo(() => preset.getRange(), [preset]);

  const selectedReports = useMemo(
    () => selectReportsForRange(sorted, range.from, range.to),
    [sorted, range.from, range.to]
  );

  const { totals, count } = useMemo(() => aggregateReports(selectedReports), [selectedReports]);
  const aggregateMetrics = useMemo(() => calcMetrics(totals), [totals]);

  if (loading) {
    return (
      <div style={{ color: DS.textMuted, fontSize: 13, padding: 40, textAlign: "center" }}>
        Cargando anuncios…
      </div>
    );
  }
  if (error) {
    return (
      <div style={{ color: DS.red, fontSize: 13, padding: 20, border: `1px solid ${DS.red}33`, borderRadius: DS.radius }}>
        Error cargando datos: {error}
      </div>
    );
  }

  const slug = company?.slug || (companyName || "").toLowerCase().replace(/\s+/g, "-");

  return (
    <div style={{ fontFamily: DS.font, color: DS.textPrimary }}>
      {/* Header: rango + acciones */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        marginBottom: 16,
      }}>
        <RangePills value={rangeKey} onChange={setRangeKey} />
        <div style={{ display: "flex", gap: 8 }}>
          {slug && (
            <a
              href={getClientHomeUrl(slug)}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: "6px 12px", fontSize: 11, borderRadius: 50, border: DS.border,
                background: "transparent", color: DS.textSecondary, textDecoration: "none", fontWeight: 600,
              }}
            >
              Ver como cliente ↗
            </a>
          )}
          {onOpenWorkspace && (
            <button
              onClick={onOpenWorkspace}
              style={{
                padding: "6px 14px", fontSize: 11, borderRadius: 50, border: "none",
                background: DS.blue, color: "#fff", cursor: "pointer", fontWeight: 600,
              }}
            >
              Abrir workspace admin ↗
            </button>
          )}
        </div>
      </div>

      <div style={{ fontSize: 11, color: DS.textMuted, marginBottom: 16 }}>
        {preset.label} · {shortDate(range.from)} – {shortDate(range.to)} · {count} reporte{count === 1 ? "" : "s"} considerado{count === 1 ? "" : "s"}
      </div>

      {count === 0 && (
        <div style={{
          padding: 32, textAlign: "center", color: DS.textMuted, fontSize: 13,
          border: DS.borderDash, borderRadius: DS.radius, marginBottom: 20,
        }}>
          No hay reportes para este rango.
        </div>
      )}

      {count > 0 && (
        <>
          <SectionTitle>KPIs del rango</SectionTitle>
          <KpiGrid metrics={aggregateMetrics} totals={totals} objectives={objectives} />

          <SectionTitle>Objetivos del cliente</SectionTitle>
          <ObjectivesGrid objectives={objectives} metrics={aggregateMetrics} totals={totals} />

          <SectionTitle>Anuncios en este rango</SectionTitle>
          <AdsList reports={selectedReports} />
        </>
      )}

      <SectionTitle>Historial completo de reportes</SectionTitle>
      <ReportsTable reports={sorted} onOpen={onOpenReport} />
    </div>
  );
}

function RangePills({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 4, background: DS.bgCard, border: DS.border, borderRadius: 50, padding: 3 }}>
      {RANGE_PRESETS.map((p) => {
        const active = value === p.key;
        return (
          <button
            key={p.key}
            onClick={() => onChange(p.key)}
            style={{
              padding: "6px 14px",
              borderRadius: 50,
              border: "none",
              background: active ? DS.blue : "transparent",
              color: active ? "#fff" : DS.textSecondary,
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: DS.font,
            }}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 600, color: DS.textMuted,
      letterSpacing: "0.1em", textTransform: "uppercase",
      marginTop: 24, marginBottom: 10,
    }}>
      {children}
    </div>
  );
}

function KpiGrid({ metrics, totals, objectives }) {
  if (!metrics) {
    return (
      <div style={{ color: DS.textMuted, fontSize: 12, padding: 16, border: DS.borderDash, borderRadius: DS.radius }}>
        Los reportes del rango no tienen suficiente data para calcular métricas.
      </div>
    );
  }
  const cpa = metrics.costPerPurchase;
  const cards = [
    {
      label: "Inversión", value: fmtCOP(totals.spend), status: "neutral",
      ref: `${fmtInt(totals.clicks)} clicks · ${fmtInt(totals.impressions)} imp.`,
    },
    {
      label: "Ventas", value: fmtCOP(totals.conversion), status: "neutral",
      ref: `${fmtInt(totals.purchases)} compras`,
    },
    {
      label: "ROAS", value: fmtNum(metrics.roas, 2) + "×",
      status: classifyMetric(metrics.roas, objectives.roasTarget, objectives.roasMin, "higher"),
      ref: `meta ${objectives.roasTarget}× · mín ${objectives.roasMin}×`,
    },
    {
      label: "Costo / compra", value: fmtCOP(cpa),
      status: classifyMetric(cpa, objectives.costPerPurchaseTarget, objectives.costPerPurchaseMax, "lower"),
      ref: `meta ${fmtCOP(objectives.costPerPurchaseTarget)} · máx ${fmtCOP(objectives.costPerPurchaseMax)}`,
    },
    {
      label: "CTR", value: fmtNum(metrics.ctr, 2) + "%", status: "neutral",
      ref: `CPC ${fmtCOP(metrics.cpc)}`,
    },
    {
      label: "Ticket promedio", value: fmtCOP(metrics.avgTicket), status: "neutral",
      ref: null,
    },
  ];

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
      gap: 10,
    }}>
      {cards.map((c) => <KpiCard key={c.label} {...c} />)}
    </div>
  );
}

function KpiCard({ label, value, status, ref }) {
  const colorByStatus = { good: DS.green, warn: DS.amber, bad: DS.red, neutral: DS.textPrimary };
  const c = colorByStatus[status] || DS.textPrimary;
  return (
    <div style={{
      background: DS.bgCard,
      border: status === "neutral" ? DS.border : `1px solid ${c}33`,
      borderRadius: DS.radius,
      padding: "14px 16px",
    }}>
      <div style={{ fontSize: 10, color: DS.textMuted, letterSpacing: "0.05em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, color: c }}>{value}</div>
      {ref && <div style={{ fontSize: 10, color: DS.textMuted, marginTop: 4 }}>{ref}</div>}
    </div>
  );
}

function ObjectivesGrid({ objectives, metrics, totals }) {
  const cpa = metrics?.costPerPurchase;
  const rows = [
    { label: "ROAS mínimo",          value: `${objectives.roasMin}×`,                         actual: metrics ? fmtNum(metrics.roas, 2) + "×" : "—" },
    { label: "ROAS meta",            value: `${objectives.roasTarget}×`,                      actual: metrics ? fmtNum(metrics.roas, 2) + "×" : "—" },
    { label: "Costo/compra máx",     value: fmtCOP(objectives.costPerPurchaseMax),            actual: cpa ? fmtCOP(cpa) : "—" },
    { label: "Costo/compra meta",    value: fmtCOP(objectives.costPerPurchaseTarget),         actual: cpa ? fmtCOP(cpa) : "—" },
    { label: "Ventas del rango",     value: fmtCOP(objectives.revenueTarget) + " (meta mes)", actual: fmtCOP(totals.conversion) },
  ];
  return (
    <div style={{
      background: DS.bgCard,
      border: DS.border,
      borderRadius: DS.radius,
      overflow: "hidden",
    }}>
      {rows.map((r, i) => (
        <div key={r.label} style={{
          display: "grid",
          gridTemplateColumns: "1fr auto auto",
          gap: 12,
          padding: "10px 14px",
          borderTop: i === 0 ? "none" : DS.border,
          fontSize: 12,
          alignItems: "center",
        }}>
          <div style={{ color: DS.textSecondary }}>{r.label}</div>
          <div style={{ color: DS.textMuted, fontFamily: "monospace" }}>{r.value}</div>
          <div style={{ color: DS.textPrimary, fontFamily: "monospace", fontWeight: 600, minWidth: 80, textAlign: "right" }}>{r.actual}</div>
        </div>
      ))}
    </div>
  );
}

// Muestra los anuncios observados de los reportes del rango, agrupando por
// nombre de anuncio (si el mismo anuncio aparece en varios reportes).
function AdsList({ reports }) {
  const ads = useMemo(() => collectAdObservations(reports), [reports]);
  if (ads.length === 0) {
    return (
      <div style={{ color: DS.textMuted, fontSize: 12, padding: 16, border: DS.borderDash, borderRadius: DS.radius }}>
        No se observaron anuncios específicos en los reportes del rango.
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {ads.map((ad, i) => (
        <div key={i} style={{
          background: DS.bgCard,
          border: DS.border,
          borderRadius: DS.radiusSm,
          padding: "12px 14px",
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: 10,
          alignItems: "start",
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: DS.textPrimary, marginBottom: 4 }}>
              {ad.name}
            </div>
            {ad.severities.length > 0 && (
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
                {ad.severities.map((s, si) => (
                  <SeverityPill key={si} severity={s} />
                ))}
              </div>
            )}
            {ad.observations.map((o, oi) => (
              <div key={oi} style={{ fontSize: 12, color: DS.textSecondary, lineHeight: 1.5, marginBottom: oi === ad.observations.length - 1 ? 0 : 4 }}>
                <span style={{ color: DS.textMuted, fontSize: 10, marginRight: 6 }}>
                  {o.period}:
                </span>
                {o.text}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10, color: DS.textMuted, textAlign: "right", whiteSpace: "nowrap" }}>
            {ad.reportCount} reporte{ad.reportCount === 1 ? "" : "s"}
          </div>
        </div>
      ))}
    </div>
  );
}

function SeverityPill({ severity }) {
  const colors = {
    critico: DS.red, critical: DS.red,
    alto: DS.red, alta: DS.red, high: DS.red,
    medio: DS.amber, media: DS.amber, medium: DS.amber,
    bajo: DS.green, baja: DS.green, low: DS.green,
    ok: DS.green, bueno: DS.green, buena: DS.green,
  };
  const color = colors[String(severity).toLowerCase()] || DS.textMuted;
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: "2px 7px",
      borderRadius: 50, background: color + "22", color,
      textTransform: "uppercase", letterSpacing: "0.06em",
    }}>
      {severity}
    </span>
  );
}

function collectAdObservations(reports) {
  const map = new Map();
  for (const r of reports) {
    const obs = Array.isArray(r.adObservations) ? r.adObservations : [];
    for (const o of obs) {
      const name = o.adName || o.name || o.nombreExacto || "Anuncio sin nombre";
      const text = o.observation || o.observacion || o.text || "";
      const period = r.period || "";
      const severity = o.severity || o.severidad;
      if (!map.has(name)) {
        map.set(name, { name, observations: [], severities: [], reportCount: 0 });
      }
      const entry = map.get(name);
      entry.reportCount += 1;
      if (text) entry.observations.push({ text, period });
      if (severity && !entry.severities.includes(severity)) entry.severities.push(severity);
    }
  }
  // Ordenar por número de reportes descendente (anuncios más recurrentes primero)
  return [...map.values()].sort((a, b) => b.reportCount - a.reportCount);
}

const TYPE_LABEL = {
  horas: "Por horas",
  diario: "Diarios",
  semanal: "Semanales",
  mensual: "Mensuales",
  puntual: "Puntuales",
};
const TYPE_COLOR = {
  horas: "#378ADD",
  diario: "#1DB97A",
  semanal: "#A855F7",
  mensual: "#F5A623",
  puntual: "#E24B4A",
};
const TYPE_ORDER = ["horas", "diario", "semanal", "mensual", "puntual"];

function ReportsTable({ reports, onOpen }) {
  const grouped = useMemo(() => {
    const groups = {};
    reports.forEach((r) => {
      const type = r.type || "puntual";
      if (!groups[type]) groups[type] = [];
      groups[type].push(r);
    });
    return groups;
  }, [reports]);

  const types = TYPE_ORDER.filter((t) => grouped[t]?.length);
  if (types.length === 0) {
    return (
      <div style={{ color: DS.textMuted, fontSize: 12, padding: 16, border: DS.borderDash, borderRadius: DS.radius }}>
        Sin reportes registrados.
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {types.map((t) => (
        <div key={t}>
          <div style={{
            fontSize: 10, fontWeight: 700, color: TYPE_COLOR[t],
            letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6,
          }}>
            {TYPE_LABEL[t]} · {grouped[t].length}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {grouped[t].map((r) => (
              <ReportRow key={r.id} report={r} color={TYPE_COLOR[t]} onOpen={onOpen} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ReportRow({ report, color, onOpen }) {
  const m = calcMetrics(report);
  return (
    <button
      onClick={() => onOpen?.(report)}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto auto auto",
        gap: 12,
        padding: "10px 14px",
        background: DS.bgCard,
        border: DS.border,
        borderRadius: DS.radiusSm,
        textAlign: "left",
        cursor: "pointer",
        fontFamily: DS.font,
        alignItems: "center",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = color + "66"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = ""; }}
    >
      <div style={{ fontSize: 12, color: DS.textPrimary, fontWeight: 500 }}>
        {report.period || "Sin período"}
      </div>
      <div style={{ fontSize: 11, color: DS.textMuted, fontFamily: "monospace" }}>
        {m ? `ROAS ${fmtNum(m.roas, 2)}×` : "—"}
      </div>
      <div style={{ fontSize: 11, color: DS.textMuted, fontFamily: "monospace" }}>
        {fmtCOP(report.conversion)}
      </div>
      <div style={{ fontSize: 10, color: DS.textHint }}>Ver →</div>
    </button>
  );
}
