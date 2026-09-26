import { useMemo, useState } from "react";
import { DS, withAlpha } from "../../../lib/design.js";
import { ClientModal } from "../modals/ClientModal.jsx";
import {
  formatCOP, formatCOPCompact, calcMRR, calcPipelineWeighted,
  pendingReceivables, formatRelativeDate,
} from "../lib/finance_math.js";

const STATUS_COLOR = {
  active: "#1D9E75", prospect: "#3B82F6", paused: "#F59E0B", churned: "#888",
};

export function ClientsView({ finance }) {
  const { clients, transactions } = finance;
  const [tab, setTab] = useState("roster"); // roster | pipeline | receivables
  const [editing, setEditing] = useState(null);
  const [openNew, setOpenNew] = useState(false);

  const active = useMemo(() => clients.filter((c) => c.status === "active"), [clients]);
  const prospects = useMemo(() => clients.filter((c) => c.status === "prospect"), [clients]);
  const paused = useMemo(() => clients.filter((c) => c.status === "paused" || c.status === "churned"), [clients]);

  const mrr = useMemo(() => calcMRR(clients), [clients]);
  const pipeWeighted = useMemo(() => calcPipelineWeighted(clients), [clients]);
  const receivables = useMemo(() => pendingReceivables(transactions), [transactions]);
  const recvTotal = useMemo(() => receivables.reduce((s, t) => s + Number(t.amount || 0), 0), [receivables]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6, padding: 4, background: DS.bgCard, border: DS.border, borderRadius: 50 }}>
          {[
            { k: "roster",       label: `Roster · ${active.length}` },
            { k: "pipeline",     label: `Pipeline · ${prospects.length}` },
            { k: "receivables",  label: `Por cobrar · ${receivables.length}` },
          ].map((t) => {
            const active2 = tab === t.k;
            return (
              <button key={t.k} onClick={() => setTab(t.k)} style={{
                padding: "6px 14px", borderRadius: 50, border: "none",
                background: active2 ? DS.bgSide : "transparent",
                color: active2 ? DS.textPrimary : DS.textSecondary,
                fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: DS.font,
              }}>{t.label}</button>
            );
          })}
        </div>
        <button onClick={() => setOpenNew(true)} style={{
          padding: "8px 16px", borderRadius: 50, border: "none",
          background: DS.green, color: "#fff", fontSize: 12, fontWeight: 700,
          cursor: "pointer", fontFamily: DS.font,
        }}>+ Nuevo cliente</button>
      </div>

      {tab === "roster" && (
        <>
          <div style={{
            padding: "10px 14px", borderRadius: 10,
            background: DS.bgCard, border: DS.border,
            fontSize: 11, color: DS.textSecondary,
          }}>
            <strong style={{ color: DS.green }}>MRR activo: {formatCOP(mrr)}</strong>
            {" · "}{active.length} clientes en retainer
          </div>
          {clients.length === 0 ? (
            <Empty>Sin clientes. Creá el primero para empezar.</Empty>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
              {[...active, ...paused].map((c) => <ClientCard key={c.id} client={c} onClick={() => setEditing(c)} />)}
            </div>
          )}
        </>
      )}

      {tab === "pipeline" && (
        <>
          <div style={{
            padding: "10px 14px", borderRadius: 10,
            background: DS.bgCard, border: DS.border,
            fontSize: 11, color: DS.textSecondary,
          }}>
            <strong style={{ color: DS.blue }}>Pipeline ponderado: {formatCOP(pipeWeighted)}/mes</strong>
            {" · "}{prospects.length} prospectos
          </div>
          {prospects.length === 0 ? (
            <Empty>Sin prospectos en pipeline.</Empty>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
              {prospects.map((c) => <ClientCard key={c.id} client={c} onClick={() => setEditing(c)} showPipeline />)}
            </div>
          )}
        </>
      )}

      {tab === "receivables" && (
        <>
          <div style={{
            padding: "10px 14px", borderRadius: 10,
            background: DS.bgCard, border: DS.border,
            fontSize: 11, color: DS.textSecondary,
          }}>
            <strong style={{ color: DS.amber }}>Total por cobrar: {formatCOP(recvTotal)}</strong>
            {" · "}{receivables.length} pendientes
          </div>
          {receivables.length === 0 ? (
            <Empty>Sin cuentas por cobrar.</Empty>
          ) : (
            <div style={{ background: DS.bgCard, border: DS.border, borderRadius: 12, overflow: "hidden" }}>
              {receivables.map((t) => {
                const client = clients.find((c) => c.id === t.client_id);
                return (
                  <div key={t.id} style={{
                    padding: "12px 16px", borderBottom: `1px solid ${withAlpha(DS.textHint, "22")}`,
                    display: "flex", alignItems: "center", gap: 10,
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                        {client?.name || t.counterparty || "Cliente"}
                      </div>
                      <div style={{ fontSize: 11, color: DS.textMuted, marginTop: 2 }}>
                        {t.description}
                        {t.due_date && (
                          <span style={{ marginLeft: 8, color: t.status === "overdue" ? DS.red : DS.textMuted }}>
                            · vence {formatRelativeDate(t.due_date)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: DS.green, fontVariantNumeric: "tabular-nums" }}>
                      {formatCOP(t.amount)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {openNew && <ClientModal client={null} finance={finance} onClose={() => setOpenNew(false)} />}
      {editing && <ClientModal client={editing} finance={finance} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ClientCard({ client, onClick, showPipeline }) {
  const color = client.color || STATUS_COLOR[client.status] || DS.blue;
  return (
    <button onClick={onClick} style={{
      padding: 16, borderRadius: 14, background: DS.bgCard,
      border: `1px solid ${withAlpha(color, "44")}`,
      cursor: "pointer", fontFamily: DS.font, textAlign: "left",
      position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 3,
        background: `linear-gradient(90deg, ${color}, transparent)`,
      }} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: DS.textPrimary }}>{client.name}</div>
        <span style={{
          fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 50,
          background: withAlpha(color, "22"), color, letterSpacing: "0.06em", textTransform: "uppercase",
        }}>{client.status}</span>
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: DS.textPrimary, fontVariantNumeric: "tabular-nums" }}>
        {formatCOP(client.monthly_value)}<span style={{ fontSize: 11, color: DS.textMuted, marginLeft: 4, fontWeight: 400 }}>/mes</span>
      </div>
      {showPipeline && (
        <div style={{ marginTop: 10 }}>
          {client.pipeline_stage && (
            <div style={{ fontSize: 11, color: DS.textSecondary, textTransform: "capitalize" }}>
              Stage: <strong>{client.pipeline_stage}</strong>
            </div>
          )}
          <div style={{ fontSize: 11, color: DS.textMuted, marginTop: 4 }}>
            Probabilidad: {Math.round((client.pipeline_probability || 0) * 100)}%
          </div>
          <div style={{ fontSize: 11, color: DS.blue, marginTop: 6, fontWeight: 600 }}>
            Esperado: {formatCOPCompact(Number(client.monthly_value || 0) * Number(client.pipeline_probability || 0))}/mes
          </div>
        </div>
      )}
      {client.payment_day && client.status === "active" && (
        <div style={{ fontSize: 11, color: DS.textMuted, marginTop: 10 }}>
          Cobra día {client.payment_day} de cada mes
        </div>
      )}
    </button>
  );
}

function Empty({ children }) {
  return (
    <div style={{ padding: 40, textAlign: "center", color: DS.textMuted, fontSize: 12, background: DS.bgCard, border: DS.borderDash, borderRadius: 12 }}>
      {children}
    </div>
  );
}
