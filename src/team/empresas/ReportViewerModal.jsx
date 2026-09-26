import { useEffect } from "react";
import { DS } from "../../lib/design.js";
import { calcMetrics, fmtCOP, fmtNum, fmtInt } from "../../lib/reports/metrics.js";

// Modal read-only para ver un reporte. No permite editar ni interactuar con
// la data — solo se muestra como tarjetas y bloques de texto.
export function ReportViewerModal({ report, companyName, onClose }) {
  useEffect(() => {
    if (!report) return;
    const handler = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", handler);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = prev;
    };
  }, [report, onClose]);

  if (!report) return null;

  const metrics = calcMetrics(report);
  const sections = report.sections || {};
  const observations = Array.isArray(report.adObservations) ? report.adObservations : [];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        zIndex: 1000,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "40px 20px",
        overflowY: "auto",
        fontFamily: DS.font,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: DS.bg,
          border: DS.border,
          borderRadius: DS.radius,
          width: "100%",
          maxWidth: 860,
          padding: "28px 32px 40px",
          color: DS.textPrimary,
          boxShadow: "0 40px 80px rgba(0,0,0,0.5)",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 20,
          paddingBottom: 14,
          borderBottom: DS.border,
        }}>
          <div>
            <div style={{ fontSize: 10, color: DS.textMuted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>
              {companyName} · Reporte {report.type || ""}
            </div>
            <div style={{ fontSize: 22, fontWeight: 600 }}>
              {report.period || "Sin período"}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: "8px 16px",
              borderRadius: 50,
              border: DS.border,
              background: "transparent",
              color: DS.textSecondary,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Cerrar ×
          </button>
        </div>

        {/* KPIs */}
        {metrics && (
          <div style={{ marginBottom: 24 }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              gap: 10,
            }}>
              <Stat label="Inversión" value={fmtCOP(report.spend)} />
              <Stat label="Ventas" value={fmtCOP(report.conversion)} />
              <Stat label="ROAS" value={fmtNum(metrics.roas, 2) + "×"} accent={DS.green} />
              <Stat label="Compras" value={fmtInt(report.purchases)} />
              <Stat label="Costo / compra" value={fmtCOP(metrics.costPerPurchase)} />
              <Stat label="CTR" value={fmtNum(metrics.ctr, 2) + "%"} />
              <Stat label="CPC" value={fmtCOP(metrics.cpc)} />
              <Stat label="Ticket promedio" value={fmtCOP(metrics.avgTicket)} />
            </div>
          </div>
        )}

        {/* Secciones */}
        {Object.entries(sections)
          .filter(([k, v]) => v && typeof v === "string" && k !== "_campaignDetails")
          .map(([key, value]) => (
            <Section key={key} title={humanizeKey(key)}>
              <pre style={{
                whiteSpace: "pre-wrap",
                fontFamily: DS.font,
                fontSize: 13,
                lineHeight: 1.6,
                color: DS.textSecondary,
                margin: 0,
              }}>{value}</pre>
            </Section>
          ))}

        {/* Observaciones de anuncios */}
        {observations.length > 0 && (
          <Section title="Observaciones de anuncios">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {observations.map((obs, i) => (
                <div key={i} style={{
                  background: DS.bgCard,
                  border: DS.border,
                  borderRadius: DS.radiusSm,
                  padding: "12px 14px",
                }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: DS.textPrimary, marginBottom: 4 }}>
                    {obs.adName || obs.name || `Anuncio ${i + 1}`}
                  </div>
                  {obs.observation && (
                    <div style={{ fontSize: 12, color: DS.textSecondary, lineHeight: 1.5 }}>
                      {obs.observation}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        <div style={{ marginTop: 28, fontSize: 10, color: DS.textMuted, textAlign: "center" }}>
          Vista read-only · para editar abre el workspace admin
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div style={{
      background: DS.bgCard,
      border: DS.border,
      borderRadius: DS.radiusSm,
      padding: "10px 12px",
    }}>
      <div style={{ fontSize: 10, color: DS.textMuted, letterSpacing: "0.05em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: accent || DS.textPrimary }}>{value}</div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        fontSize: 10,
        fontWeight: 700,
        color: DS.textMuted,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        marginBottom: 8,
      }}>
        {title}
      </div>
      <div style={{
        background: DS.bgCard,
        border: DS.border,
        borderRadius: DS.radius,
        padding: "14px 16px",
      }}>
        {children}
      </div>
    </div>
  );
}

function humanizeKey(key) {
  // camelCase → Title Case español-friendly
  const withSpaces = String(key).replace(/([A-Z])/g, " $1");
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
}
