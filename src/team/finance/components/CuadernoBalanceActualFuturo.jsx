// BALANCE — tabla horizontal con 4 columnas (Actual | Valor | Futuro | Valor).
//
// Exporta:
//   <CuadernoBalanceActualFuturo> — con PanelCard wrapper (uso standalone).
//   <BalanceInner> — sin wrapper, para uso desde CuadernoSituacionBalance.

import { useMemo } from "react";
import { DS, withAlpha } from "../../../lib/design.js";
import { PanelCard } from "./PanelCard.jsx";
import { formatCOP, calcTotalCash, remainingOf } from "../lib/finance_math.js";

const NAVY = "#1E3A5F";
export const BALANCE_COL = "85px 1fr 85px 1fr";

export function computeBalanceCalcs(accounts, transactions) {
  const dineroActual = calcTotalCash(accounts);
  // Dinero futuro = actual + lo que FALTA por recibir (amount - paid_amount).
  const unreceivedIncome = transactions
    .filter((t) => t.type === "income" && t.status !== "cancelled")
    .reduce((s, t) => s + remainingOf(t), 0);
  const dineroFuturo = dineroActual + unreceivedIncome;
  // Gastos pendientes = lo que FALTA por pagar.
  const gastos = transactions
    .filter((t) => t.type === "expense" && t.status !== "cancelled")
    .reduce((s, t) => s + remainingOf(t), 0);
  return {
    dineroActual,
    dineroFuturo,
    gastos,
    totalActual: dineroActual - gastos,
    totalFuturo: dineroFuturo - gastos,
  };
}

// footerInside=true (default) muestra el row TOTAL ACTUAL/FUTURO interno.
// footerInside=false omite ese row — el parent (panel unificado) renderiza el footer.
export function BalanceInner({ finance, footerInside = true }) {
  const { accounts, transactions } = finance;
  const calcs = useMemo(() => computeBalanceCalcs(accounts, transactions), [accounts, transactions]);
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{
        display: "grid", gridTemplateColumns: BALANCE_COL, gap: 6,
        padding: "5px 8px",
        background: DS.bgSide,
        borderBottom: `1px solid ${withAlpha(DS.textHint, "44")}`,
        fontSize: 9, fontWeight: 700, color: DS.textMuted,
        letterSpacing: "0.06em", textTransform: "uppercase",
      }}>
        <div>Actual</div>
        <div style={{ textAlign: "right" }}>Valor</div>
        <div>Futuro</div>
        <div style={{ textAlign: "right" }}>Valor</div>
      </div>
      <Row
        leftLabel="DINERO" leftValue={calcs.dineroActual} leftColor={DS.green}
        rightLabel="DINERO" rightValue={calcs.dineroFuturo} rightColor={DS.green}
      />
      <Row
        leftLabel="GASTOS" leftValue={calcs.gastos} leftColor={DS.red}
        rightLabel="GASTOS" rightValue={calcs.gastos} rightColor={DS.red}
      />
      {footerInside && (
        <Row
          leftLabel="TOTAL ACTUAL"
          leftValue={calcs.totalActual}
          leftColor={calcs.totalActual >= 0 ? DS.green : DS.red}
          rightLabel="TOTAL FUTURO"
          rightValue={calcs.totalFuturo}
          rightColor={calcs.totalFuturo >= 0 ? DS.green : DS.red}
          bold
          background={withAlpha(NAVY, "10")}
        />
      )}
    </div>
  );
}

export function CuadernoBalanceActualFuturo({ finance }) {
  return (
    <PanelCard title="BALANCE" color={NAVY}>
      <BalanceInner finance={finance} />
    </PanelCard>
  );
}

function Row({ leftLabel, leftValue, leftColor, rightLabel, rightValue, rightColor, bold, background }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: BALANCE_COL, gap: 6,
      padding: "8px 10px",
      borderBottom: `1px solid ${withAlpha(DS.textHint, "14")}`,
      background: background || "transparent",
    }}>
      <div style={{
        fontSize: bold ? 11 : 10, fontWeight: bold ? 800 : 700,
        color: DS.textMuted, letterSpacing: "0.06em",
        textTransform: "uppercase",
        display: "flex", alignItems: "center",
      }}>{leftLabel}</div>
      <div style={{
        textAlign: "right",
        fontSize: bold ? 14 : 12, fontWeight: bold ? 800 : 600,
        color: leftColor, fontVariantNumeric: "tabular-nums",
      }}>{formatCOP(leftValue)}</div>
      <div style={{
        fontSize: bold ? 11 : 10, fontWeight: bold ? 800 : 700,
        color: DS.textMuted, letterSpacing: "0.06em",
        textTransform: "uppercase",
        display: "flex", alignItems: "center",
      }}>{rightLabel}</div>
      <div style={{
        textAlign: "right",
        fontSize: bold ? 14 : 12, fontWeight: bold ? 800 : 600,
        color: rightColor, fontVariantNumeric: "tabular-nums",
      }}>{formatCOP(rightValue)}</div>
    </div>
  );
}
