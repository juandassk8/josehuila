// CashFlowChart — diseño tipo Shopify/Linear con línea CERO clara en el centro.
//
// Lo que ves día por día:
//   • Verde hacia arriba = ingreso
//   • Rojo hacia abajo = gasto
//   • Línea horizontal cero gruesa = el equilibrio
//   • Línea dashed vertical = hoy
//   • Dots = pagos planeados/marcados
//
// El header con 4 stats sigue mostrando saldo inicial, ingresos totales,
// gastos totales y saldo final proyectado.

import { useMemo, useState } from "react";
import {
  ComposedChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, ReferenceDot,
} from "recharts";
import { DS, withAlpha } from "../../../lib/design.js";
import { formatCOPCompact, formatCOP, paymentDotColor } from "../lib/finance_math.js";

const TODAY_KEY = new Date().toISOString().slice(0, 10);

export function CashFlowChart({ transactions, from, to, payments = [], startBalance = 0 }) {
  // Serie de NETO DIARIO (ingreso - gasto). Cada día tiene income/expense
  // separados pero también `net` para mostrar como bar divergente.
  const series = useMemo(() => {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    fromDate.setHours(0, 0, 0, 0);
    toDate.setHours(23, 59, 59, 999);

    const days = new Map();
    for (let d = new Date(fromDate); d <= toDate; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      days.set(key, { dateKey: key, income: 0, expense: 0 });
    }

    for (const t of transactions || []) {
      if (t.status === "cancelled") continue;
      const dateStr = (t.status === "pending" || t.status === "overdue")
        ? t.due_date || t.transaction_date
        : t.paid_date || t.transaction_date;
      if (!dateStr) continue;
      const key = String(dateStr).slice(0, 10);
      const b = days.get(key);
      if (!b) continue;
      const amount = Number(t.amount || 0);
      if (t.type === "income") b.income += amount;
      else b.expense += amount;
    }

    // Sumar budget items planeados (no doblamos los completed que ya están en transactions)
    for (const p of payments || []) {
      if (p._source !== "budget") continue;
      if (p.status === "completed") continue;
      if (!p.due_date) continue;
      const key = String(p.due_date).slice(0, 10);
      const b = days.get(key);
      if (!b) continue;
      const remaining = Math.max(Number(p.amount || 0) - Number(p.paid_amount || 0), 0);
      if (remaining <= 0) continue;
      if (p.type === "income") b.income += remaining;
      else b.expense += remaining;
    }

    let cum = Number(startBalance) || 0;
    return Array.from(days.values()).map((d) => {
      const net = d.income - d.expense;
      cum += net;
      return {
        ...d,
        net,
        // Para ComposedChart con bars divergentes: income es positivo, expense es negativo
        incomeBar: d.income,
        expenseBar: -d.expense,
        cumulative: cum,
      };
    });
  }, [transactions, from, to, startBalance, payments]);

  const today = new Date(); today.setHours(0, 0, 0, 0);

  const totalIncome = useMemo(() => series.reduce((s, d) => s + d.income, 0), [series]);
  const totalExpense = useMemo(() => series.reduce((s, d) => s + d.expense, 0), [series]);
  const endBalance = series[series.length - 1]?.cumulative ?? startBalance;
  const delta = endBalance - startBalance;

  // Dominio simétrico para que la línea cero quede en el medio visualmente.
  const maxAbsDaily = useMemo(() => {
    let m = 0;
    for (const d of series) {
      m = Math.max(m, d.income, d.expense);
    }
    return m;
  }, [series]);
  const yDomain = useMemo(() => {
    if (!maxAbsDaily) return [-1000, 1000];
    const padded = maxAbsDaily * 1.15;
    return [-padded, padded];
  }, [maxAbsDaily]);

  // Dots de pago sobre la línea cero (más legible que sobre las barras).
  const paymentDots = useMemo(() => {
    return (payments || [])
      .filter((p) => p.due_date)
      .map((p) => {
        const dateKey = String(p.due_date).slice(0, 10);
        const day = series.find((s) => s.dateKey === dateKey);
        if (!day) return null;
        // Posición: si es income → arriba (income/2). Si es expense → abajo (-expense/2).
        const y = p.type === "income"
          ? (day.income > 0 ? day.income * 0.6 : maxAbsDaily * 0.1)
          : (day.expense > 0 ? -day.expense * 0.6 : -maxAbsDaily * 0.1);
        return {
          dateKey, x: dateKey, y,
          color: paymentDotColor(p, today),
          payment: p,
        };
      })
      .filter(Boolean);
  }, [payments, series, today, maxAbsDaily]);

  const CustomTooltip = ({ active, label }) => {
    if (!active || !label) return null;
    const day = series.find((s) => s.dateKey === label);
    const paymentsHere = paymentDots.filter((p) => p.dateKey === label);
    if (!day && paymentsHere.length === 0) return null;
    const hasActivity = day && (day.income > 0 || day.expense > 0);
    return (
      <div style={{
        background: DS.bgSide,
        border: `1px solid ${withAlpha(DS.textHint, "55")}`,
        borderRadius: 10,
        padding: "10px 12px",
        fontSize: 11, color: DS.textPrimary,
        boxShadow: "0 12px 28px rgba(0,0,0,0.35)",
        minWidth: 220,
      }}>
        <div style={{
          color: DS.textMuted, fontSize: 9, fontWeight: 700,
          letterSpacing: "0.08em", marginBottom: 8, textTransform: "uppercase",
        }}>
          {new Date(label).toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" })}
        </div>
        {paymentsHere.length > 0 && (
          <div style={{
            marginBottom: hasActivity ? 8 : 0,
            paddingBottom: hasActivity ? 8 : 0,
            borderBottom: hasActivity
              ? `1px solid ${withAlpha(DS.textHint, "22")}` : "none",
          }}>
            <div style={{ fontSize: 9, color: DS.textMuted, fontWeight: 700, letterSpacing: "0.06em", marginBottom: 4 }}>PAGOS</div>
            {paymentsHere.map((p, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: p.color, flexShrink: 0 }} />
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.payment.name}</span>
                <strong style={{
                  color: p.payment.type === "income" ? DS.green : DS.red,
                  fontVariantNumeric: "tabular-nums", marginLeft: 6,
                }}>
                  {p.payment.type === "income" ? "+" : "−"}{formatCOPCompact(p.payment.amount)}
                </strong>
              </div>
            ))}
          </div>
        )}
        {hasActivity && (
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {day.income > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: DS.green }}>Ingresos</span>
                <span style={{ color: DS.green, fontVariantNumeric: "tabular-nums" }}>+{formatCOPCompact(day.income)}</span>
              </div>
            )}
            {day.expense > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: DS.red }}>Gastos</span>
                <span style={{ color: DS.red, fontVariantNumeric: "tabular-nums" }}>−{formatCOPCompact(day.expense)}</span>
              </div>
            )}
            <div style={{
              display: "flex", justifyContent: "space-between",
              marginTop: 4, paddingTop: 4,
              borderTop: `1px solid ${withAlpha(DS.textHint, "22")}`,
            }}>
              <span style={{ color: DS.textSecondary }}>Neto del día</span>
              <span style={{
                color: day.net < 0 ? DS.red : day.net > 0 ? DS.green : DS.textMuted,
                fontVariantNumeric: "tabular-nums", fontWeight: 700,
              }}>{day.net > 0 ? "+" : ""}{formatCOP(day.net)}</span>
            </div>
            <div style={{
              display: "flex", justifyContent: "space-between",
            }}>
              <span style={{ color: DS.textMuted, fontSize: 10 }}>Saldo acumulado</span>
              <span style={{
                color: day.cumulative < 0 ? DS.red : DS.textPrimary,
                fontVariantNumeric: "tabular-nums", fontSize: 10,
              }}>{formatCOP(day.cumulative)}</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  const balanceColor = endBalance < 0 ? DS.red : endBalance > 0 ? DS.green : DS.textMuted;
  const deltaSign = delta > 0 ? "+" : delta < 0 ? "−" : "";
  const deltaColor = delta > 0 ? DS.green : delta < 0 ? DS.red : DS.textMuted;

  return (
    <div style={{
      borderRadius: 14, background: DS.bgCard, border: DS.border,
      overflow: "hidden",
    }}>
      {/* Header con stats compactas */}
      <div style={{
        padding: "16px 20px 12px",
        borderBottom: `1px solid ${withAlpha(DS.textHint, "22")}`,
      }}>
        <div style={{
          display: "flex", alignItems: "flex-start", justifyContent: "space-between",
          gap: 12, marginBottom: 14,
        }}>
          <div>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: "0.16em",
              textTransform: "uppercase", color: DS.textMuted,
            }}>
              Flujo de caja
            </div>
            <div style={{ fontSize: 11, color: DS.textSecondary, marginTop: 4 }}>
              {new Date(from).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}
              {" → "}
              {new Date(to).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}
              {payments.length > 0 && ` · ${payments.length} pagos marcados`}
            </div>
          </div>
          <LegendInfoButton />
        </div>

        {/* Stats horizontales tipo Shopify — cada una en cápsula */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 8,
        }}>
          <Stat label="Saldo inicial" value={formatCOP(startBalance)} />
          <Stat label="Ingresos" value={`+${formatCOP(totalIncome)}`} color={DS.green} />
          <Stat label="Gastos" value={`−${formatCOP(totalExpense)}`} color={DS.red} />
          <Stat
            label="Saldo final"
            value={formatCOP(endBalance)}
            color={balanceColor}
            sub={delta !== 0 ? `${deltaSign}${formatCOPCompact(Math.abs(delta))}` : null}
            subColor={deltaColor}
            isPrimary
          />
        </div>
      </div>

      {/* Chart neto diario sobre el cero */}
      <div style={{ width: "100%", height: 260, padding: "12px 14px 6px" }}>
        <ResponsiveContainer>
          <ComposedChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 4 }} stackOffset="sign">
            <XAxis
              dataKey="dateKey"
              tick={{ fontSize: 10, fill: DS.textMuted }}
              tickFormatter={(d) => {
                const date = new Date(d);
                return date.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
              }}
              minTickGap={60}
              axisLine={false}
              tickLine={false}
              dy={6}
            />
            <YAxis
              tick={{ fontSize: 10, fill: DS.textMuted }}
              tickFormatter={(v) => v === 0 ? "$0" : formatCOPCompact(v)}
              width={56}
              axisLine={false}
              tickLine={false}
              domain={yDomain}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: withAlpha(DS.textHint, "10") }} />
            {/* Línea cero MUY visible — el corazón del chart */}
            <ReferenceLine y={0} stroke={withAlpha(DS.textHint, "88")} strokeWidth={2} />
            {/* Línea hoy */}
            <ReferenceLine x={TODAY_KEY} stroke={withAlpha(DS.amber, "66")} strokeDasharray="3 3" strokeWidth={1} />
            {/* Bar de ingreso — verde, hacia arriba */}
            <Bar dataKey="incomeBar" fill={DS.green} radius={[3, 3, 0, 0]} maxBarSize={20} isAnimationActive={false} />
            {/* Bar de gasto — rojo, hacia abajo */}
            <Bar dataKey="expenseBar" fill={DS.red} radius={[0, 0, 3, 3]} maxBarSize={20} isAnimationActive={false} />
            {paymentDots.map((d, i) => (
              <ReferenceDot
                key={i}
                x={d.x}
                y={d.y}
                r={5}
                fill={d.color}
                stroke={DS.bgCard}
                strokeWidth={2}
                isFront={true}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Stat({ label, value, color, sub, subColor, isPrimary }) {
  const accent = color || DS.textPrimary;
  const bg = isPrimary
    ? withAlpha(accent, "10")
    : withAlpha(DS.textHint, "08");
  const border = isPrimary
    ? withAlpha(accent, "40")
    : withAlpha(DS.textHint, "20");
  return (
    <div style={{
      padding: "10px 12px",
      borderRadius: 10,
      background: bg,
      border: `1px solid ${border}`,
      minWidth: 0,
    }}>
      <div style={{
        fontSize: 9, fontWeight: 700, color: DS.textMuted,
        letterSpacing: "0.1em", textTransform: "uppercase",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {label}
      </div>
      <div style={{
        fontSize: isPrimary ? 17 : 14,
        fontWeight: 700,
        color: accent,
        fontVariantNumeric: "tabular-nums",
        letterSpacing: "-0.01em",
        marginTop: 4,
        lineHeight: 1.1,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {value}
      </div>
      {sub && (
        <div style={{
          fontSize: 10,
          color: subColor || DS.textMuted,
          fontVariantNumeric: "tabular-nums",
          marginTop: 3,
          fontWeight: 600,
        }}>
          {sub} vs inicial
        </div>
      )}
    </div>
  );
}

function LegendInfoButton() {
  const [open, setOpen] = useState(false);
  return (
    <div
      style={{ position: "relative", flexShrink: 0 }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button style={{
        width: 24, height: 24, borderRadius: "50%",
        border: `1px solid ${withAlpha(DS.textHint, "44")}`,
        background: "transparent", color: DS.textMuted,
        fontSize: 11, fontWeight: 600, cursor: "help",
        fontFamily: DS.font, lineHeight: 1, fontStyle: "italic",
      }}>i</button>
      {open && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 8px)",
          right: 0,
          background: DS.bgSide,
          border: `1px solid ${withAlpha(DS.textHint, "55")}`,
          borderRadius: 12,
          padding: "12px 14px",
          fontSize: 11, color: DS.textPrimary,
          boxShadow: "0 12px 28px rgba(0,0,0,0.4)",
          minWidth: 260,
          zIndex: 100,
        }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: DS.textMuted, letterSpacing: "0.1em", marginBottom: 8 }}>CÓMO LEER ESTO</div>
          <div style={{ marginBottom: 10, lineHeight: 1.5 }}>
            La <strong>línea horizontal del medio es el cero</strong>. Cada día:
            las barras verdes son ingresos (suben), las rojas son gastos (bajan).
            El "saldo final" arriba es la proyección al fin del período.
          </div>
          <div style={{ fontSize: 9, fontWeight: 700, color: DS.textMuted, letterSpacing: "0.08em", marginBottom: 6 }}>DOTS DE PAGO</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <Row col="#1D9E75" label="Pagado" />
            <Row col="#888888" label="Futuro (>14d)" />
            <Row col="#F59E0B" label="Próximo (5-14d)" />
            <Row col="#F97316" label="Muy próximo (1-4d)" />
            <Row col="#E54B4B" label="Hoy / Vencido" />
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ col, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: 10, height: 10, borderRadius: "50%", background: col }} />
      <span style={{ fontSize: 11 }}>{label}</span>
    </div>
  );
}
