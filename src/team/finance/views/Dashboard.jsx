// Dashboard de Finance OS — versión limpia.
// Stack vertical mínimo: período → (alerta runway si crítico) → 4 KPIs compactos →
// flujo de caja + calendario lado a lado → situación actual.
// Lo demás (categorías, ingresos, hormigas, cuentas detalladas) vive en sus
// propias tabs — no en el dashboard.

import { useMemo, useState } from "react";
import { DS, withAlpha } from "../../../lib/design.js";
import { KpiCard } from "../components/KpiCard.jsx";
import { CashFlowChart } from "../components/CashFlowChart.jsx";
import { PeriodSelector } from "../components/PeriodSelector.jsx";
import { PaymentCalendarList } from "../components/PaymentCalendarList.jsx";
import { SituationCard } from "../components/SituationCard.jsx";
import { PayBudgetItemModal } from "../modals/PayBudgetItemModal.jsx";
import {
  formatCOP, formatCOPCompact,
  calcTotalCash, calcRunway,
  totalPendingIncome, totalPendingExpense,
  pendingReceivables, upcomingPayables,
  getPeriodRange, collectPaymentsInRange,
} from "../lib/finance_math.js";

export function Dashboard({ finance, onNavigate }) {
  const {
    accounts, transactions, teamCosts,
    subscriptions, debts, budgetItems,
  } = finance;
  const [periodKey, setPeriodKey] = useState("this_month");
  const [customRange, setCustomRange] = useState({
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
    to: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 7).toISOString().slice(0, 10),
  });
  const [payingItem, setPayingItem] = useState(null);

  const { from, to } = useMemo(
    () => getPeriodRange(periodKey, customRange),
    [periodKey, customRange]
  );

  const totalCash = useMemo(() => calcTotalCash(accounts), [accounts]);
  const { months: runwayMonths, monthlyFixed } = useMemo(
    () => calcRunway({ accounts, teamCosts, subscriptions, transactions, debts, budgetItems }),
    [accounts, teamCosts, subscriptions, transactions, debts, budgetItems]
  );
  const recvTotal = useMemo(() => totalPendingIncome(transactions, debts, budgetItems), [transactions, debts, budgetItems]);
  const payTotal = useMemo(() => totalPendingExpense(transactions, debts, budgetItems), [transactions, debts, budgetItems]);
  const receivablesList = useMemo(() => pendingReceivables(transactions, debts), [transactions, debts]);
  const upcoming = useMemo(() => upcomingPayables(transactions, debts, { n: 5 }), [transactions, debts]);

  const periodPayments = useMemo(() => collectPaymentsInRange({
    budgetItems, transactions, from, to,
  }), [budgetItems, transactions, from, to]);

  const runwayVariant = runwayMonths < 1 ? "danger" : runwayMonths < 3 ? "warning" : "primary";
  const showRunwayAlert = runwayMonths < 1 && monthlyFixed > 0;

  if (accounts.length === 0) {
    return (
      <div style={{ padding: 36, borderRadius: 14, background: DS.bgCard, border: DS.borderDash, textAlign: "center" }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>🏦</div>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Empezá creando una cuenta</div>
        <div style={{ fontSize: 12, color: DS.textMuted, marginBottom: 18 }}>
          Necesitás al menos una cuenta para empezar a registrar transacciones.
        </div>
        <button
          onClick={() => onNavigate?.("accounts")}
          style={{
            padding: "10px 22px", borderRadius: 50, border: "none",
            background: DS.green, color: "#fff",
            fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: DS.font,
          }}
        >+ Crear primera cuenta</button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Período */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: DS.textMuted, letterSpacing: "0.08em", textTransform: "uppercase" }}>Período</span>
        <PeriodSelector value={periodKey} onChange={setPeriodKey} customRange={customRange} onCustomChange={setCustomRange} />
      </div>

      {/* Alerta runway — compacta */}
      {showRunwayAlert && (
        <div style={{
          padding: "8px 12px", borderRadius: 8,
          background: withAlpha(DS.red, "10"),
          border: `1px solid ${withAlpha(DS.red, "33")}`,
          color: DS.textSecondary, fontSize: 12,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{ fontSize: 13 }}>⚠️</span>
          <span>
            Runway <strong style={{ color: DS.red }}>{runwayMonths.toFixed(1)} meses</strong> · cubrís {Math.ceil(runwayMonths * 30)} días de gastos fijos.
          </span>
        </div>
      )}

      {/* 4 KPIs compactos */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
        <KpiCard
          title="Saldo total"
          icon="💰" variant="primary"
          value={formatCOP(totalCash)}
          sub={accounts.length === 1 ? accounts[0].name : `${accounts.length} cuentas`}
        />
        <KpiCard
          title="Runway"
          icon="📅" variant={runwayVariant}
          value={!isFinite(runwayMonths) ? "∞" : `${runwayMonths.toFixed(1)} meses`}
          sub={monthlyFixed > 0 ? `${formatCOPCompact(monthlyFixed)}/mes fijos` : "Sin gastos fijos"}
        />
        <KpiCard
          title="Por cobrar"
          icon="📥" variant="neutral"
          value={formatCOP(recvTotal)}
          sub={receivablesList.length > 0 ? `${receivablesList.length} pendientes` : "Sin pendientes"}
          hint={receivablesList.find((r) => r.status === "overdue") ? "⚠️ Hay vencidas" : null}
        />
        <KpiCard
          title="Por pagar"
          icon="📤" variant={payTotal > totalCash ? "danger" : "warning"}
          value={formatCOP(payTotal)}
          sub={upcoming.length > 0 ? `Próximos ${upcoming.length} pagos` : "Sin pagos pendientes"}
        />
      </div>

      {/* Flujo + Calendario */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
        gap: 12,
        alignItems: "stretch",
      }}>
        <CashFlowChart
          transactions={transactions}
          from={from}
          to={to}
          payments={periodPayments}
          startBalance={totalCash}
        />
        <PaymentCalendarList
          payments={periodPayments}
          onPay={(item) => setPayingItem(item)}
          maxHeight={420}
        />
      </div>

      {/* Situación actual (sola, ancho completo) */}
      <SituationCard accounts={accounts} transactions={transactions} debts={debts} budgetItems={budgetItems} />

      {payingItem && (
        <PayBudgetItemModal
          item={payingItem}
          finance={finance}
          onClose={() => setPayingItem(null)}
        />
      )}
    </div>
  );
}
