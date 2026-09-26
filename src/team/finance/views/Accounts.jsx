import { useMemo, useState } from "react";
import { DS, withAlpha } from "../../../lib/design.js";
import { AccountModal } from "../modals/AccountModal.jsx";
import { formatCOP, formatCOPCompact } from "../lib/finance_math.js";

const SPARK_DAYS = 30;

// Reconstruye la serie de saldo diario de los últimos N días para una cuenta,
// caminando hacia atrás desde current_balance y aplicando las transactions
// completadas en ese período. Sin tabla de snapshots histórica, esto es la
// mejor aproximación que tenemos.
function computeAccountSeries(account, transactions, days = SPARK_DAYS) {
  const cutoffMs = Date.now() - days * 86400000;
  const txs = (transactions || [])
    .filter((t) => t.account_id === account.id && t.status === "completed")
    .filter((t) => new Date(t.transaction_date).getTime() >= cutoffMs)
    .sort((a, b) => new Date(a.transaction_date) - new Date(b.transaction_date));
  const netChange = txs.reduce(
    (sum, t) => sum + (t.type === "income" ? 1 : -1) * Number(t.amount || 0),
    0
  );
  let balance = Number(account.current_balance || 0) - netChange;
  // Buckets diarios desde cutoff hasta hoy.
  const buckets = [];
  for (let i = 0; i <= days; i++) {
    buckets.push({ day: cutoffMs + i * 86400000, delta: 0 });
  }
  const dayOf = (ms) => {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const bucketIdxByDay = new Map(buckets.map((b, i) => [dayOf(b.day), i]));
  for (const t of txs) {
    const idx = bucketIdxByDay.get(dayOf(new Date(t.transaction_date).getTime()));
    if (idx == null) continue;
    const sign = t.type === "income" ? 1 : -1;
    buckets[idx].delta += sign * Number(t.amount || 0);
  }
  const series = [];
  for (const b of buckets) {
    balance += b.delta;
    series.push(balance);
  }
  return series;
}

function Sparkline({ series, width = 90, height = 26 }) {
  if (!series || series.length < 2) {
    return (
      <div style={{ width, height, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: DS.textHint }}>
        —
      </div>
    );
  }
  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = max - min || 1;
  const pts = series.map((v, i) => {
    const x = (i / (series.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const trendUp = series[series.length - 1] >= series[0];
  const color = trendUp ? DS.green : DS.red;
  const areaPath = `M ${pts[0]} L ${pts.join(" L ")} L ${width},${height} L 0,${height} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      <path d={areaPath} fill={withAlpha(color, "18")} />
      <polyline
        points={pts.join(" ")}
        stroke={color}
        strokeWidth={1.5}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AccountsView({ finance }) {
  const { accounts, transactions } = finance;
  const [editing, setEditing] = useState(null);
  const [openNew, setOpenNew] = useState(false);

  // Total de cash (excluye credit cards — esos son deuda, no liquidez).
  const totalCash = useMemo(
    () => accounts
      .filter((a) => a.type !== "credit_card")
      .reduce((s, a) => s + Number(a.current_balance || 0), 0),
    [accounts]
  );

  // Pre-computar series de sparkline una sola vez.
  const seriesByAcc = useMemo(() => {
    const map = new Map();
    for (const a of accounts) map.set(a.id, computeAccountSeries(a, transactions));
    return map;
  }, [accounts, transactions]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        gap: 10, flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <div style={{ fontSize: 12, color: DS.textMuted, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Total
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: DS.textPrimary, fontVariantNumeric: "tabular-nums" }}>
            {formatCOP(totalCash)}
          </div>
          <div style={{ fontSize: 11, color: DS.textMuted }}>
            · {accounts.length} cuenta{accounts.length !== 1 ? "s" : ""}
          </div>
        </div>
        <button onClick={() => setOpenNew(true)} style={{
          padding: "8px 16px", borderRadius: 50, border: "none",
          background: DS.green, color: "#fff", fontSize: 12, fontWeight: 700,
          cursor: "pointer", fontFamily: DS.font,
        }}>+ Nueva cuenta</button>
      </div>

      {accounts.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: DS.textMuted, fontSize: 12, background: DS.bgCard, border: DS.borderDash, borderRadius: 12 }}>
          Sin cuentas. Crea la primera para empezar a registrar transacciones.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {accounts.map((a) => {
            const balance = Number(a.current_balance || 0);
            const isCard = a.type === "credit_card";
            const pct = totalCash > 0 && !isCard ? (balance / totalCash) * 100 : 0;
            const series = seriesByAcc.get(a.id) || [];
            const trendUp = series.length >= 2 && series[series.length - 1] >= series[0];
            const accentColor = a.color || (isCard ? DS.amber : DS.green);
            return (
              <button
                key={a.id}
                onClick={() => setEditing(a)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(180px, 1.4fr) minmax(120px, 1fr) 90px 130px",
                  alignItems: "center",
                  gap: 14,
                  padding: "14px 16px",
                  borderRadius: 12,
                  background: DS.bgCard,
                  border: `1px solid ${withAlpha(accentColor, "33")}`,
                  cursor: "pointer",
                  fontFamily: DS.font,
                  textAlign: "left",
                  transition: "border-color 0.15s, background 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = withAlpha(accentColor, "88"); }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = withAlpha(accentColor, "33"); }}
              >
                {/* Identidad */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: withAlpha(accentColor, "18"),
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 20, flexShrink: 0,
                  }}>
                    {a.icon || (isCard ? "💳" : "🏦")}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: DS.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {a.name}
                    </div>
                    <div style={{ fontSize: 10, color: DS.textMuted, textTransform: "capitalize", marginTop: 2 }}>
                      {a.type.replace("_", " ")}
                      {isCard && a.credit_limit > 0 && ` · cupo ${formatCOPCompact(a.credit_limit)}`}
                    </div>
                  </div>
                </div>

                {/* Barra de % */}
                <div style={{ minWidth: 0 }}>
                  {isCard ? (
                    <div style={{ fontSize: 10, color: DS.textMuted, fontStyle: "italic" }}>
                      tarjeta de crédito
                    </div>
                  ) : (
                    <>
                      <div style={{
                        height: 8, background: withAlpha(DS.textHint, "22"), borderRadius: 6,
                        overflow: "hidden",
                      }}>
                        <div style={{
                          width: `${Math.max(2, Math.min(100, pct))}%`,
                          height: "100%",
                          background: accentColor,
                          borderRadius: 6,
                          transition: "width 0.3s",
                        }} />
                      </div>
                      <div style={{ fontSize: 10, color: DS.textMuted, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
                        {pct.toFixed(1)}% del total
                      </div>
                    </>
                  )}
                </div>

                {/* Sparkline tendencia */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                  <Sparkline series={series} />
                  <div style={{ fontSize: 9, color: trendUp ? DS.green : DS.red, letterSpacing: "0.04em" }}>
                    {trendUp ? "▲" : "▼"} 30d
                  </div>
                </div>

                {/* Saldo */}
                <div style={{ textAlign: "right" }}>
                  <div style={{
                    fontSize: 18, fontWeight: 700,
                    color: isCard && balance > 0 ? DS.red : DS.textPrimary,
                    fontVariantNumeric: "tabular-nums",
                  }}>
                    {formatCOP(balance)}
                  </div>
                  <div style={{ fontSize: 10, color: DS.textMuted, marginTop: 2, letterSpacing: "0.04em" }}>
                    {isCard ? "DEBE" : "SALDO"}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {openNew && <AccountModal account={null} finance={finance} onClose={() => setOpenNew(false)} />}
      {editing && <AccountModal account={editing} finance={finance} onClose={() => setEditing(null)} />}
    </div>
  );
}
