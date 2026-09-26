import { useMemo, useState } from "react";
import { DS, withAlpha } from "../../../lib/design.js";
import { TeamCostModal } from "../modals/TeamCostModal.jsx";
import { formatCOP, formatCOPCompact, calcMRR } from "../lib/finance_math.js";

export function TeamCostsView({ finance }) {
  const { teamCosts, clients } = finance;
  const [editing, setEditing] = useState(null);
  const [openNew, setOpenNew] = useState(false);

  const active = useMemo(() => teamCosts.filter((t) => t.status === "active"), [teamCosts]);
  const totalCost = useMemo(() => active.reduce((s, t) => s + Number(t.monthly_cost || 0), 0), [active]);
  const mrr = useMemo(() => calcMRR(clients), [clients]);
  const ratio = mrr > 0 ? totalCost / mrr : 0;
  const ratioColor = ratio > 0.7 ? DS.red : ratio > 0.5 ? DS.amber : DS.green;
  const ownerPay = useMemo(() => teamCosts.filter((t) => t.is_owner_pay), [teamCosts]);
  const rest = useMemo(() => teamCosts.filter((t) => !t.is_owner_pay), [teamCosts]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{
        padding: 16, borderRadius: 14, background: DS.bgCard, border: DS.border,
        display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap",
      }}>
        <div>
          <div style={{ fontSize: 11, color: DS.textMuted, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>
            Costo total equipo
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: DS.textPrimary, marginTop: 4 }}>
            {formatCOP(totalCost)}<span style={{ fontSize: 11, color: DS.textMuted, marginLeft: 4, fontWeight: 400 }}>/mes</span>
          </div>
          {mrr > 0 && (
            <div style={{ fontSize: 11, color: ratioColor, marginTop: 4, fontWeight: 600 }}>
              {Math.round(ratio * 100)}% del MRR ({formatCOPCompact(mrr)}/mes)
              {ratio > 0.6 && " · ratio alto"}
            </div>
          )}
        </div>
        <button onClick={() => setOpenNew(true)} style={{
          padding: "8px 16px", borderRadius: 50, border: "none",
          background: DS.green, color: "#fff", fontSize: 12, fontWeight: 700,
          cursor: "pointer", fontFamily: DS.font,
        }}>+ Nuevo miembro</button>
      </div>

      {teamCosts.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: DS.textMuted, fontSize: 12, background: DS.bgCard, border: DS.borderDash, borderRadius: 12 }}>
          Sin miembros cargados. Agregá a tu equipo para ver el costo total y cobertura.
        </div>
      ) : (
        <>
        {ownerPay.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#A855F7", letterSpacing: "0.12em", marginBottom: 8, textTransform: "uppercase" }}>
              🪪 Tu sueldo
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
              {ownerPay.map((tc) => (
                <TeamCard key={tc.id} tc={tc} clients={clients} highlight onClick={() => setEditing(tc)} />
              ))}
            </div>
          </div>
        )}
        {ownerPay.length > 0 && rest.length > 0 && (
          <div style={{ fontSize: 10, fontWeight: 700, color: DS.textMuted, letterSpacing: "0.12em", marginBottom: 8, textTransform: "uppercase" }}>
            Equipo
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {(ownerPay.length > 0 ? rest : teamCosts).map((tc) => (
            <TeamCard key={tc.id} tc={tc} clients={clients} onClick={() => setEditing(tc)} />
          ))}
        </div>
        </>
      )}

      {openNew && <TeamCostModal teamCost={null} finance={finance} onClose={() => setOpenNew(false)} />}
      {editing && <TeamCostModal teamCost={editing} finance={finance} onClose={() => setEditing(null)} />}
    </div>
  );
}

function TeamCard({ tc, clients, onClick, highlight }) {
  const coveredClients = (tc.covered_by_client_ids || [])
    .map((id) => clients.find((c) => c.id === id))
    .filter(Boolean);
  const coveredAmount = coveredClients.reduce((s, c) => s + Number(c.monthly_value || 0), 0);
  const coveragePct = tc.monthly_cost > 0 ? Math.min(coveredAmount / tc.monthly_cost, 2) : 0;
  const borderColor = highlight
    ? "rgba(168,85,247,0.55)"
    : (tc.status === "active" ? withAlpha(DS.blue, "44") : DS.textHint);
  return (
    <button onClick={onClick} style={{
      padding: 16, borderRadius: 14,
      background: highlight ? "rgba(168,85,247,0.06)" : DS.bgCard,
      border: `1px solid ${borderColor}`,
      cursor: "pointer", fontFamily: DS.font, textAlign: "left",
      opacity: tc.status === "inactive" ? 0.55 : 1,
      position: "relative",
    }}>
      {highlight && (
        <span style={{
          position: "absolute", top: 8, right: 8,
          fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 50,
          background: "rgba(168,85,247,0.22)", color: "#A855F7",
          letterSpacing: "0.06em",
        }}>TU SUELDO</span>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: DS.textPrimary }}>{tc.name}</div>
        {tc.payment_day && (
          <span style={{ fontSize: 9, color: DS.textMuted, letterSpacing: "0.06em" }}>
            DÍA {tc.payment_day}
          </span>
        )}
      </div>
      {tc.role && <div style={{ fontSize: 11, color: DS.textSecondary, marginBottom: 8 }}>{tc.role}</div>}
      <div style={{ fontSize: 18, fontWeight: 700, color: DS.textPrimary, fontVariantNumeric: "tabular-nums" }}>
        {formatCOP(tc.monthly_cost)}<span style={{ fontSize: 11, color: DS.textMuted, marginLeft: 4, fontWeight: 400 }}>/mes</span>
      </div>
      {!highlight && (coveredClients.length > 0 ? (
        <div style={{ marginTop: 10 }}>
          <div style={{ height: 4, borderRadius: 2, background: withAlpha(DS.textHint, "33"), overflow: "hidden" }}>
            <div style={{
              width: `${Math.min(coveragePct * 100, 100)}%`,
              height: "100%",
              background: coveragePct >= 1 ? DS.green : DS.amber,
            }} />
          </div>
          <div style={{ fontSize: 10, color: coveragePct >= 1 ? DS.green : DS.amber, marginTop: 4, fontWeight: 600 }}>
            Cubierto {Math.round(coveragePct * 100)}% por {coveredClients.map((c) => c.name).join(", ")}
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 10, color: DS.textMuted, marginTop: 10, fontStyle: "italic" }}>
          Sin cobertura asignada
        </div>
      ))}
    </button>
  );
}
