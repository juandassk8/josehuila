// TABLA DE BALANCE — calculadora pura del período.
// Filas: INGRESOS, GASTOS, TOTAL, (espacio), Para mi (residual).

import { useMemo } from "react";
import { DS, withAlpha } from "../../../lib/design.js";
import { PanelCard } from "./PanelCard.jsx";
import { formatCOP } from "../lib/finance_math.js";

const NAVY = "#1E3A5F";

export function CuadernoBalanceCard({ finance, from, to, scopeBuckets }) {
  const { transactions } = finance;

  const calcs = useMemo(() => {
    const fromMs = new Date(from).getTime();
    const toMs = new Date(to).getTime() + 86400000;
    const inRange = (t) => {
      const ms = new Date(t.transaction_date).getTime();
      return ms >= fromMs && ms < toMs;
    };
    const ingresos = transactions
      .filter((t) => t.type === "income" && inRange(t))
      .reduce((s, t) => s + Number(t.amount || 0), 0);
    const gastos = transactions
      .filter((t) => t.type === "expense" && inRange(t))
      .reduce((s, t) => s + Number(t.amount || 0), 0);
    const total = ingresos - gastos;

    // "Para mi" = ingresos − (Vivir + Lifestyle). Lo que sobra de tus ingresos
    // después de los gastos personales (sin contar agencia, que se "autofinancia").
    const paraMi = scopeBuckets
      .filter((sb) => sb.includeInParaMi)
      .reduce((acc, sb) => {
        const sum = transactions
          .filter((t) => t.type === "expense" && inRange(t))
          .filter((t) => matchesScope(t, sb))
          .reduce((s, t) => s + Number(t.amount || 0), 0);
        return acc - sum;
      }, ingresos);

    return { ingresos, gastos, total, paraMi };
  }, [transactions, from, to, scopeBuckets]);

  return (
    <PanelCard title="TABLA DE BALANCE" color={NAVY}>
      <div style={{ padding: 0 }}>
        <BalanceRow label="INGRESOS" value={calcs.ingresos} color={DS.green} />
        <BalanceRow label="GASTOS"   value={calcs.gastos}   color={DS.red} />
        <BalanceRow
          label="TOTAL"
          value={calcs.total}
          color={calcs.total >= 0 ? DS.green : DS.red}
          bold
          signed
        />
        <div style={{ height: 8 }} />
        <BalanceRow
          label="Para mi"
          value={calcs.paraMi}
          color={calcs.paraMi >= 0 ? DS.green : DS.red}
          signed
          subtle
        />
      </div>
    </PanelCard>
  );
}

function BalanceRow({ label, value, color, bold, signed, subtle }) {
  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "10px 14px",
      borderBottom: `1px solid ${withAlpha(DS.textHint, "14")}`,
      background: subtle ? withAlpha(color, "08") : "transparent",
    }}>
      <span style={{
        fontSize: 11,
        fontWeight: bold ? 800 : 700,
        color: subtle ? DS.textSecondary : DS.textMuted,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
      }}>{label}</span>
      <span style={{
        fontSize: bold ? 15 : 13,
        fontWeight: bold ? 800 : 600,
        color,
        fontVariantNumeric: "tabular-nums",
      }}>
        {signed && value > 0 && "+"}{formatCOP(value)}
      </span>
    </div>
  );
}

function matchesScope(tx, sb) {
  if (sb.scopeId && tx.scope_id === sb.scopeId) return true;
  if (sb.legacyKeys && sb.legacyKeys.includes(tx.scope)) return true;
  return false;
}
